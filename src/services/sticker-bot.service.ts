import {
  WORLD_CUP_CATALOG,
  formatSticker,
  getAllStickerRefs,
  getCatalogEntry,
  getCatalogTotal,
  isKnownSticker,
  sortStickers,
  stickerFromKey,
  stickerKey,
  type StickerRef,
} from '../catalog/world-cup.catalog';
import { AddStickerCommand } from '../commands/add-sticker-command';
import { RemoveStickerCommand } from '../commands/remove-sticker-command';
import { parseStickerMessage, type ParsedBotMessage } from '../parsers/sticker-message.parser';
import {
  collectionRepository,
  type CollectionRepository,
  type StickerHistoryAction,
  type StickerHistoryEntry,
} from '../repositories/collection.repository';

export type BotMessageResult = {
  reply: string;
  parsed: ParsedBotMessage;
};

type CountryStats = {
  countryCode: string;
  countryName: string;
  total: number;
  owned: StickerRef[];
  missing: StickerRef[];
  percentage: string;
};

const HELP_TEXT = [
  'Comandos disponibles:',
  'arg4, arg 4, ARG-4 o argentina 4: consulta una estampa.',
  'arg: muestra progreso del pais.',
  'arg -name: muestra nombres cuando existan en el catalogo.',
  'add arg4: agrega una estampa.',
  'rm arg4 o remove arg 4: elimina una estampa.',
  'undo: revierte el ultimo cambio.',
  'missing arg, duplicates, progress.',
].join('\n');

export class StickerBotService {
  constructor(private readonly repository: CollectionRepository = collectionRepository) {}

  handleMessage(text: string, ownerId = 'default'): BotMessageResult {
    const parsed = parseStickerMessage(text);

    return {
      parsed,
      reply: this.buildReply(parsed, ownerId),
    };
  }

  private buildReply(parsed: ParsedBotMessage, ownerId: string): string {
    switch (parsed.intent) {
      case 'querySticker':
        return this.querySticker(ownerId, parsed.sticker, parsed.showNames);
      case 'queryCountry':
        return this.queryCountry(ownerId, parsed.countryCode, parsed.showNames);
      case 'addSticker':
        return this.addSticker(ownerId, parsed.sticker, parsed.showNames);
      case 'removeSticker':
        return this.removeSticker(ownerId, parsed.sticker, parsed.showNames);
      case 'missing':
        return this.showMissing(ownerId, parsed.countryCode, parsed.showNames);
      case 'duplicates':
        return this.showDuplicates(ownerId, parsed.countryCode, parsed.showNames);
      case 'progress':
        return this.showProgress(ownerId);
      case 'undo':
        return this.undoLast(ownerId);
      case 'help':
        return HELP_TEXT;
      case 'unknown':
        return `${parsed.reason}\n\n${HELP_TEXT}`;
    }
  }

  private querySticker(ownerId: string, sticker: StickerRef, showNames: boolean): string {
    const validationMessage = this.validateSticker(sticker);

    if (validationMessage) {
      return validationMessage;
    }

    const quantity = this.repository.getQuantity(ownerId, sticker);
    const label = formatSticker(sticker, { includeName: showNames });

    if (quantity <= 0) {
      return `No tienes ${label}.`;
    }

    return `Si tienes ${label}. Cantidad: ${quantity}.`;
  }

  private queryCountry(ownerId: string, countryCode: string, showNames: boolean): string {
    const stats = this.getCountryStats(ownerId, countryCode);

    if (!stats) {
      return `No reconozco el pais ${countryCode}.`;
    }

    const lines = [
      `${stats.countryCode} ${stats.countryName}`,
      `Tienes ${stats.owned.length}/${stats.total} (${stats.percentage}).`,
    ];

    if (stats.owned.length > 0) {
      lines.push(`Estampas: ${this.formatStickerList(stats.owned, showNames)}.`);
    } else {
      lines.push(`No tienes estampas de ${stats.countryCode}.`);
    }

    lines.push(`Faltantes (${stats.missing.length}): ${this.formatStickerList(stats.missing, showNames)}.`);

    return lines.join('\n');
  }

  private addSticker(ownerId: string, sticker: StickerRef, showNames: boolean): string {
    const validationMessage = this.validateSticker(sticker);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new AddStickerCommand(this.repository, ownerId, sticker);
    const result = command.execute();

    this.recordHistory(ownerId, 'add', result);

    const label = formatSticker(sticker, { includeName: showNames });
    const duplicateText = result.currentQuantity > 1 ? ` (${result.currentQuantity - 1} duplicada/s)` : '';

    return `${label} agregada. Ahora tienes ${result.currentQuantity}${duplicateText}.`;
  }

  private removeSticker(ownerId: string, sticker: StickerRef, showNames: boolean): string {
    const validationMessage = this.validateSticker(sticker);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new RemoveStickerCommand(this.repository, ownerId, sticker);
    const result = command.execute();
    const label = formatSticker(sticker, { includeName: showNames });

    if (!result.changed) {
      return `No puedes eliminar ${label} porque no la tienes.`;
    }

    this.recordHistory(ownerId, 'remove', result);

    return `${label} eliminada. Ahora tienes ${result.currentQuantity}.`;
  }

  private undoLast(ownerId: string): string {
    const entry = this.repository.undoLast(ownerId);

    if (!entry) {
      return 'No hay acciones para deshacer.';
    }

    const label = formatSticker(entry.sticker, { includeName: true });
    const actionText = entry.action === 'add' ? 'agregado' : 'eliminacion';

    return `Undo aplicado: se revirtio el ${actionText} de ${label}. Ahora tienes ${entry.previousQuantity}.`;
  }

  private showMissing(ownerId: string, countryCode: string | undefined, showNames: boolean): string {
    if (!countryCode) {
      return 'Indica un pais para ver faltantes, por ejemplo: missing arg.';
    }

    const stats = this.getCountryStats(ownerId, countryCode);

    if (!stats) {
      return `No reconozco el pais ${countryCode}.`;
    }

    if (stats.missing.length === 0) {
      return `${stats.countryCode} esta completo.`;
    }

    return `Faltantes de ${stats.countryCode} (${stats.missing.length}): ${this.formatStickerList(stats.missing, showNames)}.`;
  }

  private showDuplicates(ownerId: string, countryCode: string | undefined, showNames: boolean): string {
    const duplicates = Object.entries(this.repository.getStickerQuantities(ownerId))
      .map(([key, quantity]) => ({
        sticker: stickerFromKey(key),
        quantity,
      }))
      .filter((entry): entry is { sticker: StickerRef; quantity: number } =>
        Boolean(entry.sticker && entry.quantity > 1),
      )
      .filter((entry) => !countryCode || entry.sticker.countryCode === countryCode);

    if (duplicates.length === 0) {
      return countryCode
        ? `No tienes duplicadas de ${countryCode}.`
        : 'No tienes estampas duplicadas.';
    }

    const formatted = duplicates
      .sort((left, right) => sortStickers([left.sticker, right.sticker])[0] === left.sticker ? -1 : 1)
      .map((entry) => `${formatSticker(entry.sticker, { includeName: showNames })} x${entry.quantity}`)
      .join(', ');

    return `Duplicadas: ${formatted}.`;
  }

  private showProgress(ownerId: string): string {
    const quantities = this.repository.getStickerQuantities(ownerId);
    const knownEntries = Object.entries(quantities)
      .map(([key, quantity]) => ({
        sticker: stickerFromKey(key),
        quantity,
      }))
      .filter((entry): entry is { sticker: StickerRef; quantity: number } =>
        Boolean(entry.sticker && isKnownSticker(entry.sticker) && entry.quantity > 0),
      );
    const uniqueOwned = knownEntries.length;
    const duplicates = knownEntries.reduce((total, entry) => total + Math.max(entry.quantity - 1, 0), 0);
    const countriesStarted = new Set(knownEntries.map((entry) => entry.sticker.countryCode)).size;
    const total = getCatalogTotal();

    return [
      'Progreso general',
      `Tienes ${uniqueOwned}/${total} unicas (${this.formatPercentage(uniqueOwned, total)}).`,
      `Duplicadas: ${duplicates}.`,
      `Paises iniciados: ${countriesStarted}/${WORLD_CUP_CATALOG.length}.`,
    ].join('\n');
  }

  private getCountryStats(ownerId: string, countryCode: string): CountryStats | null {
    const country = getCatalogEntry(countryCode);

    if (!country) {
      return null;
    }

    const allStickers = getAllStickerRefs(country.code);
    const quantities = this.repository.getStickerQuantities(ownerId);
    const owned = allStickers.filter((sticker) => (quantities[stickerKey(sticker)] ?? 0) > 0);
    const missing = allStickers.filter((sticker) => (quantities[stickerKey(sticker)] ?? 0) <= 0);

    return {
      countryCode: country.code,
      countryName: country.name,
      total: country.totalStickers,
      owned: sortStickers(owned),
      missing: sortStickers(missing),
      percentage: this.formatPercentage(owned.length, country.totalStickers),
    };
  }

  private formatStickerList(stickers: StickerRef[], showNames: boolean): string {
    if (stickers.length === 0) {
      return 'ninguna';
    }

    return sortStickers(stickers)
      .map((sticker) => formatSticker(sticker, { includeName: showNames }))
      .join(', ');
  }

  private formatPercentage(value: number, total: number): string {
    if (total === 0) {
      return '0%';
    }

    const percentage = (value / total) * 100;
    const formatted = percentage.toFixed(1).replace(/\.0$/, '');

    return `${formatted}%`;
  }

  private validateSticker(sticker: StickerRef): string | null {
    const country = getCatalogEntry(sticker.countryCode);

    if (!country) {
      return `No reconozco el pais ${sticker.countryCode}.`;
    }

    if (sticker.number < 1 || sticker.number > country.totalStickers) {
      return `${formatSticker(sticker)} no existe en el catalogo. ${country.code} va del 1 al ${country.totalStickers}.`;
    }

    return null;
  }

  private recordHistory(
    ownerId: string,
    action: StickerHistoryAction,
    result: {
      sticker: StickerRef;
      previousQuantity: number;
      currentQuantity: number;
      changed: boolean;
    },
  ): void {
    if (!result.changed) {
      return;
    }

    const entry: StickerHistoryEntry = {
      action,
      sticker: result.sticker,
      previousQuantity: result.previousQuantity,
      currentQuantity: result.currentQuantity,
      timestamp: new Date().toISOString(),
    };

    this.repository.recordHistory(ownerId, entry);
  }
}

export const stickerBotService = new StickerBotService();
