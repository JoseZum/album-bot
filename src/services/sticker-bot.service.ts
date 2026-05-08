import {
  AVAILABLE_ALBUM_TEMPLATES,
} from '../catalog/album-templates.catalog';
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
import {
  isBotLanguage,
  languageKeyboard,
  t,
  type BotLanguage,
} from '../i18n/bot.i18n';
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
  replyMarkup?: unknown;
  outboundMessages?: BotOutboundMessage[];
};

export type BotActionResult = {
  reply: string;
  replyMarkup?: unknown;
  outboundMessages?: BotOutboundMessage[];
};

export type BotOutboundMessage = {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
};

type CountryStats = {
  countryCode: string;
  countryName: string;
  total: number;
  owned: StickerRef[];
  missing: StickerRef[];
  percentage: string;
};

export class StickerBotService {
  constructor(private readonly repository: CollectionRepository = collectionRepository) {}

  registerUser(profile: {
    ownerId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    language?: BotLanguage;
  }): void {
    this.repository.registerProfile(profile);
  }

  handleMessage(text: string, ownerId = 'default'): BotMessageResult {
    const language = this.getLanguage(ownerId);
    const parsed = parseStickerMessage(text);

    if (!language) {
      return {
        parsed,
        ...this.languageSelectionReply(),
      };
    }

    if (parsed.intent === 'language') {
      return {
        parsed,
        ...this.languageSelectionReply(),
      };
    }

    if (parsed.intent === 'start') {
      return {
        parsed,
        ...this.startMenuReply(ownerId, language),
      };
    }

    if (this.requiresActiveAlbum(parsed) && !this.repository.hasActiveAlbum(ownerId)) {
      const menu = this.startMenuReply(ownerId, language);

      return {
        parsed,
        reply: `${t(language, 'commandRequiresActiveAlbum')}\n\n${menu.reply}`,
        replyMarkup: menu.replyMarkup,
      };
    }

    const result = parsed.intent === 'share'
      ? this.shareAlbum(ownerId, parsed.targetUsername, language)
      : { reply: this.buildReply(parsed, ownerId, language) };

    return {
      parsed,
      ...result,
    };
  }

  handleCallbackData(callbackData: string, ownerId: string): BotActionResult {
    const languageMatch = /^lang:(.+)$/.exec(callbackData);

    if (languageMatch) {
      const language = languageMatch[1];

      if (!isBotLanguage(language)) {
        return { reply: t(this.getLanguage(ownerId) ?? 'en', 'unknownCallback') };
      }

      this.repository.setLanguage(ownerId, language);
      const menu = this.startMenuReply(ownerId, language);

      return {
        reply: `${t(language, 'languageSaved')}\n\n${menu.reply}`,
        replyMarkup: menu.replyMarkup,
      };
    }

    const albumMatch = /^album:(create|select):(.+)$/.exec(callbackData);

    if (albumMatch) {
      const [, action, value] = albumMatch;
      const language = this.getLanguage(ownerId) ?? 'en';

      if (action === 'create') {
        const album = this.repository.createAlbum(ownerId, value);

        if (!album) {
          return { reply: t(language, 'unknownAlbumAction') };
        }

        return {
          reply: t(language, 'albumCreated', { albumName: album.name }),
        };
      }

      const album = this.repository.setActiveAlbum(ownerId, value);

      if (!album) {
        return { reply: t(language, 'unknownAlbumAction') };
      }

      return {
        reply: t(language, 'albumSelected', { albumName: album.name }),
      };
    }

    return this.handleShareResponse(callbackData, ownerId);
  }

  handleShareResponse(callbackData: string, ownerId: string): BotActionResult {
    const language = this.getLanguage(ownerId) ?? 'en';
    const match = /^share:(accept|decline):(.+)$/.exec(callbackData);

    if (!match) {
      return { reply: t(language, 'shareInvalid') };
    }

    const [, action, requestId] = match;

    if (action === 'accept') {
      const result = this.repository.acceptShareRequest(requestId, ownerId);

      if (result.error || !result.request) {
        return { reply: this.translateShareRepositoryError(result.error, language) ?? t(language, 'shareAcceptError') };
      }

      const responderProfile = this.repository.getProfile(ownerId);
      const responderName = responderProfile?.displayName ?? ownerId;
      const inviterLanguage = this.getLanguage(result.request.fromOwnerId) ?? language;

      return {
        reply: t(language, 'shareAccepted'),
        outboundMessages: [
          {
            chatId: result.request.fromOwnerId,
            text: t(inviterLanguage, 'shareAcceptedNotify', { responderName }),
          },
        ],
      };
    }

    const result = this.repository.declineShareRequest(requestId, ownerId);

    if (result.error || !result.request) {
      return { reply: this.translateShareRepositoryError(result.error, language) ?? t(language, 'shareDeclineError') };
    }

    const responderProfile = this.repository.getProfile(ownerId);
    const responderName = responderProfile?.displayName ?? ownerId;
    const inviterLanguage = this.getLanguage(result.request.fromOwnerId) ?? language;

    return {
      reply: t(language, 'shareDeclined'),
      outboundMessages: [
        {
          chatId: result.request.fromOwnerId,
          text: t(inviterLanguage, 'shareDeclinedNotify', { responderName }),
        },
      ],
    };
  }

  private buildReply(parsed: ParsedBotMessage, ownerId: string, language: BotLanguage): string {
    switch (parsed.intent) {
      case 'querySticker':
        return this.querySticker(ownerId, parsed.sticker, parsed.showNames, language);
      case 'queryCountry':
        return this.queryCountry(ownerId, parsed.countryCode, parsed.showNames, language);
      case 'addSticker':
        return this.addSticker(ownerId, parsed.sticker, parsed.showNames, language);
      case 'removeSticker':
        return this.removeSticker(ownerId, parsed.sticker, parsed.showNames, language);
      case 'missing':
        return this.showMissing(ownerId, parsed.countryCode, parsed.showNames, language);
      case 'duplicates':
        return this.showDuplicates(ownerId, parsed.countryCode, parsed.showNames, language);
      case 'progress':
        return this.showProgress(ownerId, language);
      case 'share':
        return this.shareAlbum(ownerId, parsed.targetUsername, language).reply;
      case 'albumList':
        return this.albumListReply(ownerId, language).reply;
      case 'albumCreate':
        return this.createAlbum(ownerId, parsed.albumName, language).reply;
      case 'albumSelect':
        return this.selectAlbum(ownerId, parsed.selector, language).reply;
      case 'albumRename':
        return this.renameAlbum(ownerId, parsed.albumName, parsed.selector, language).reply;
      case 'albumDelete':
        return this.deleteAlbum(ownerId, parsed.selector, language).reply;
      case 'albumLeave':
        return this.leaveAlbum(ownerId, language).reply;
      case 'start':
        return this.startMenuReply(ownerId, language).reply;
      case 'language':
        return this.languageSelectionReply().reply;
      case 'undo':
        return this.undoLast(ownerId, language);
      case 'help':
        return t(language, 'help');
      case 'unknown':
        return `${this.translateParseError(parsed.reason, language)}\n\n${t(language, 'help')}`;
    }
  }

  private querySticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): string {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const quantity = this.repository.getQuantity(ownerId, sticker);
    const label = formatSticker(sticker, { includeName: showNames });

    if (quantity <= 0) {
      return t(language, 'stickerNotOwned', { label });
    }

    return t(language, 'stickerOwned', { label, quantity });
  }

  private queryCountry(
    ownerId: string,
    countryCode: string,
    showNames: boolean,
    language: BotLanguage,
  ): string {
    const stats = this.getCountryStats(ownerId, countryCode);

    if (!stats) {
      return t(language, 'unknownCountry', { country: countryCode });
    }

    const lines = [
      t(language, 'countryHeader', {
        countryCode: stats.countryCode,
        countryName: stats.countryName,
      }),
      t(language, 'countryProgress', {
        owned: stats.owned.length,
        total: stats.total,
        percentage: stats.percentage,
      }),
    ];

    if (stats.owned.length > 0) {
      lines.push(t(language, 'ownedStickers', {
        stickers: this.formatStickerList(stats.owned, showNames, language),
      }));
    } else {
      lines.push(t(language, 'noCountryStickers', { countryCode: stats.countryCode }));
    }

    lines.push(t(language, 'missingStickers', {
      count: stats.missing.length,
      stickers: this.formatStickerList(stats.missing, showNames, language),
    }));

    return lines.join('\n');
  }

  private addSticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): string {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new AddStickerCommand(this.repository, ownerId, sticker);
    const result = command.execute();

    this.recordHistory(ownerId, 'add', result);

    const label = formatSticker(sticker, { includeName: showNames });
    const duplicateText = result.currentQuantity > 1
      ? t(language, 'duplicateSuffix', { count: result.currentQuantity - 1 })
      : '';

    return t(language, 'stickerAdded', {
      label,
      quantity: result.currentQuantity,
      duplicateText,
    });
  }

  private removeSticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): string {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new RemoveStickerCommand(this.repository, ownerId, sticker);
    const result = command.execute();
    const label = formatSticker(sticker, { includeName: showNames });

    if (!result.changed) {
      return t(language, 'cannotRemove', { label });
    }

    this.recordHistory(ownerId, 'remove', result);

    return t(language, 'stickerRemoved', {
      label,
      quantity: result.currentQuantity,
    });
  }

  private undoLast(ownerId: string, language: BotLanguage): string {
    const entry = this.repository.undoLast(ownerId);

    if (!entry) {
      return t(language, 'nothingToUndo');
    }

    const label = formatSticker(entry.sticker, { includeName: true });
    const actionText = entry.action === 'add' ? 'add' : 'remove';

    return t(language, 'undoApplied', {
      action: actionText,
      label,
      quantity: entry.previousQuantity,
    });
  }

  private showMissing(
    ownerId: string,
    countryCode: string | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): string {
    if (!countryCode) {
      return t(language, 'missingNeedsCountry');
    }

    const stats = this.getCountryStats(ownerId, countryCode);

    if (!stats) {
      return t(language, 'unknownCountry', { country: countryCode });
    }

    if (stats.missing.length === 0) {
      return t(language, 'countryComplete', { countryCode: stats.countryCode });
    }

    return `${stats.countryCode}: ${t(language, 'missingStickers', {
      count: stats.missing.length,
      stickers: this.formatStickerList(stats.missing, showNames, language),
    })}`;
  }

  private showDuplicates(
    ownerId: string,
    countryCode: string | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): string {
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
        ? t(language, 'duplicatesCountryNone', { countryCode })
        : t(language, 'duplicatesNone');
    }

    const formatted = duplicates
      .sort((left, right) => sortStickers([left.sticker, right.sticker])[0] === left.sticker ? -1 : 1)
      .map((entry) => `${formatSticker(entry.sticker, { includeName: showNames })} x${entry.quantity}`)
      .join(', ');

    return t(language, 'duplicatesList', { stickers: formatted });
  }

  private showProgress(ownerId: string, language: BotLanguage): string {
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
      t(language, 'generalProgressTitle'),
      t(language, 'generalProgressOwned', {
        owned: uniqueOwned,
        total,
        percentage: this.formatPercentage(uniqueOwned, total),
      }),
      t(language, 'generalProgressDuplicates', { duplicates }),
      t(language, 'generalProgressCountries', {
        countriesStarted,
        countriesTotal: WORLD_CUP_CATALOG.length,
      }),
    ].join('\n');
  }

  private shareAlbum(
    ownerId: string,
    targetUsername: string,
    language: BotLanguage,
  ): BotActionResult {
    const result = this.repository.createShareRequest(ownerId, targetUsername);

    if (result.error || !result.request) {
      return {
        reply: this.translateShareRepositoryError(result.error, language)
          ?? t(language, 'shareAcceptError'),
      };
    }

    const fromProfile = this.repository.getProfile(ownerId);
    const inviterName = fromProfile?.displayName ?? ownerId;
    const recipientLanguage = this.getLanguage(result.request.toOwnerId) ?? language;

    return {
      reply: t(language, 'shareSent', { username: targetUsername }),
      outboundMessages: [
        {
          chatId: result.request.toOwnerId,
          text: t(recipientLanguage, 'shareInvite', { inviterName }),
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: t(recipientLanguage, 'buttonYes'),
                  callback_data: `share:accept:${result.request.id}`,
                },
                {
                  text: t(recipientLanguage, 'buttonNo'),
                  callback_data: `share:decline:${result.request.id}`,
                },
              ],
            ],
          },
        },
      ],
    };
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

  private formatStickerList(
    stickers: StickerRef[],
    showNames: boolean,
    language: BotLanguage,
  ): string {
    if (stickers.length === 0) {
      return language === 'en' ? 'none' : language === 'zh' ? '无' : 'ninguna';
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

  private validateSticker(sticker: StickerRef, language: BotLanguage): string | null {
    const country = getCatalogEntry(sticker.countryCode);

    if (!country) {
      return t(language, 'unknownCountry', { country: sticker.countryCode });
    }

    if (sticker.number < 1 || sticker.number > country.totalStickers) {
      return t(language, 'invalidStickerNumber', {
        label: formatSticker(sticker),
        countryCode: country.code,
        total: country.totalStickers,
      });
    }

    return null;
  }

  private getLanguage(ownerId: string): BotLanguage | undefined {
    return this.repository.getProfile(ownerId)?.language;
  }

  private languageSelectionReply(): BotActionResult {
    return {
      reply: t('en', 'chooseLanguage'),
      replyMarkup: languageKeyboard,
    };
  }

  private startMenuReply(ownerId: string, language: BotLanguage): BotActionResult {
    const activeAlbum = this.repository.getActiveAlbum(ownerId);
    const userAlbums = this.repository.listAlbums(ownerId);
    const lines = [
      t(language, 'startMenu'),
      activeAlbum
        ? t(language, 'activeAlbumLine', { albumName: activeAlbum.name })
        : t(language, 'noActiveAlbum'),
    ];

    if (userAlbums.length > 0) {
      lines.push('');
      lines.push(t(language, 'yourAlbumsTitle'));
      lines.push(
        ...userAlbums.map((album, index) => this.formatAlbumLine(album, index, language)),
      );
    }

    lines.push('');
    lines.push(t(language, 'availableAlbumsTitle'));
    lines.push(...AVAILABLE_ALBUM_TEMPLATES.map((albumTemplate) => `- ${albumTemplate.name}`));

    const albumRows = [
      ...AVAILABLE_ALBUM_TEMPLATES.map((albumTemplate) => [
        {
          text: `${t(language, 'buttonCreateAlbum')} - ${albumTemplate.name}`,
          callback_data: `album:create:${albumTemplate.slug}`,
        },
      ]),
      ...userAlbums.map((album) => [
        {
          text: `${t(language, 'buttonSelectAlbum')} - ${album.name}`,
          callback_data: `album:select:${album.id}`,
        },
      ]),
    ];

    return {
      reply: lines.join('\n'),
      replyMarkup: {
        inline_keyboard: albumRows,
      },
    };
  }

  private albumListReply(ownerId: string, language: BotLanguage): BotActionResult {
    const userAlbums = this.repository.listAlbums(ownerId);
    const activeAlbum = this.repository.getActiveAlbum(ownerId);
    const lines = [t(language, 'albumsTitle')];

    if (activeAlbum) {
      lines.push(t(language, 'activeAlbumLine', { albumName: activeAlbum.name }));
    } else {
      lines.push(t(language, 'noActiveAlbum'));
    }

    if (userAlbums.length === 0) {
      lines.push('');
      lines.push(t(language, 'noAlbums'));
      lines.push(t(language, 'availableAlbumTemplates', {
        templates: AVAILABLE_ALBUM_TEMPLATES.map((albumTemplate) => albumTemplate.name).join(', '),
      }));

      return {
        reply: lines.join('\n'),
        replyMarkup: this.startMenuReply(ownerId, language).replyMarkup,
      };
    }

    lines.push('');
    lines.push(...userAlbums.map((album, index) => this.formatAlbumLine(album, index, language)));

    return {
      reply: lines.join('\n'),
      replyMarkup: {
        inline_keyboard: userAlbums.map((album) => [
          {
            text: `${t(language, 'buttonSelectAlbum')} - ${album.name}`,
            callback_data: `album:select:${album.id}`,
          },
        ]),
      },
    };
  }

  private createAlbum(ownerId: string, albumName: string, language: BotLanguage): BotActionResult {
    const normalizedAlbumName = albumName.trim();

    if (!normalizedAlbumName) {
      return { reply: t(language, 'albumNameRequired') };
    }

    const album = this.repository.createAlbum(
      ownerId,
      AVAILABLE_ALBUM_TEMPLATES[0].slug,
      normalizedAlbumName,
    );

    if (!album) {
      return { reply: t(language, 'albumCreateFailed') };
    }

    return {
      reply: t(language, 'albumCreated', { albumName: album.name }),
    };
  }

  private selectAlbum(ownerId: string, selector: string, language: BotLanguage): BotActionResult {
    const match = this.findAlbum(ownerId, selector);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const album = this.repository.setActiveAlbum(ownerId, match.album.id);

    if (!album) {
      return { reply: t(language, 'albumSelectFailed') };
    }

    return {
      reply: t(language, 'albumSelected', { albumName: album.name }),
    };
  }

  private renameAlbum(
    ownerId: string,
    albumName: string,
    selector: string | undefined,
    language: BotLanguage,
  ): BotActionResult {
    const normalizedAlbumName = albumName.trim();

    if (!normalizedAlbumName) {
      return { reply: t(language, 'albumNameRequired') };
    }

    const match = selector
      ? this.findAlbum(ownerId, selector)
      : this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const result = this.repository.renameAlbum(ownerId, match.album.id, normalizedAlbumName);

    if (result.error || !result.album) {
      return {
        reply: this.translateAlbumRepositoryError(result.error, language)
          ?? t(language, 'albumRenameFailed'),
      };
    }

    return {
      reply: t(language, 'albumRenamed', { albumName: result.album.name }),
    };
  }

  private deleteAlbum(
    ownerId: string,
    selector: string | undefined,
    language: BotLanguage,
  ): BotActionResult {
    const match = selector
      ? this.findAlbum(ownerId, selector)
      : this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const result = this.repository.deleteAlbum(ownerId, match.album.id);

    if (result.error || !result.album) {
      return {
        reply: this.translateAlbumRepositoryError(result.error, language)
          ?? t(language, 'albumDeleteFailed'),
      };
    }

    return {
      reply: t(language, 'albumDeleted', { albumName: result.album.name }),
      replyMarkup: this.startMenuReply(ownerId, language).replyMarkup,
    };
  }

  private leaveAlbum(ownerId: string, language: BotLanguage): BotActionResult {
    const match = this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const result = this.repository.leaveAlbum(ownerId, match.album.id);

    if (result.error || !result.album) {
      return {
        reply: this.translateAlbumRepositoryError(result.error, language)
          ?? t(language, 'albumLeaveFailed'),
      };
    }

    return {
      reply: t(language, 'albumLeft', { albumName: result.album.name }),
      replyMarkup: this.startMenuReply(ownerId, language).replyMarkup,
    };
  }

  private findActiveAlbum(ownerId: string): {
    album: NonNullable<ReturnType<CollectionRepository['getActiveAlbum']>>;
    error?: never;
  } | {
    album?: never;
    error: 'not_found';
  } {
    const album = this.repository.getActiveAlbum(ownerId);

    return album ? { album } : { error: 'not_found' };
  }

  private findAlbum(ownerId: string, selector: string): {
    album: NonNullable<ReturnType<CollectionRepository['getActiveAlbum']>>;
    error?: never;
  } | {
    album?: never;
    error: 'not_found' | 'ambiguous';
  } {
    const albums = this.repository.listAlbums(ownerId);
    const normalizedSelector = selector.trim().toLowerCase();
    const numberSelector = Number(normalizedSelector);

    if (Number.isInteger(numberSelector) && numberSelector >= 1 && numberSelector <= albums.length) {
      return { album: albums[numberSelector - 1] };
    }

    const exactMatch = albums.find((album) =>
      album.id === selector || album.name.toLowerCase() === normalizedSelector,
    );

    if (exactMatch) {
      return { album: exactMatch };
    }

    const partialMatches = albums.filter((album) =>
      album.name.toLowerCase().includes(normalizedSelector),
    );

    if (partialMatches.length === 1) {
      return { album: partialMatches[0] };
    }

    if (partialMatches.length > 1) {
      return { error: 'ambiguous' };
    }

    return { error: 'not_found' };
  }

  private formatAlbumLine(
    album: ReturnType<CollectionRepository['listAlbums']>[number],
    index: number,
    language: BotLanguage,
  ): string {
    const markers = [
      album.isActive ? t(language, 'albumActiveMarker') : undefined,
      album.isShared ? t(language, 'albumSharedMarker') : t(language, 'albumOwnedMarker'),
    ].filter(Boolean);
    const ownerText = album.isShared && album.ownerDisplayName
      ? `, ${album.ownerDisplayName}`
      : '';

    return `${index + 1}. ${album.name} [${markers.join(', ')}] (${album.memberCount}${ownerText})`;
  }

  private translateAlbumLookupError(
    error: 'not_found' | 'ambiguous',
    language: BotLanguage,
  ): string {
    return error === 'ambiguous'
      ? t(language, 'albumAmbiguous')
      : t(language, 'albumNotFound');
  }

  private requiresActiveAlbum(parsed: ParsedBotMessage): boolean {
    return [
      'querySticker',
      'queryCountry',
      'addSticker',
      'removeSticker',
      'missing',
      'duplicates',
      'progress',
      'share',
      'undo',
    ].includes(parsed.intent);
  }

  private translateParseError(reason: string, language: BotLanguage): string {
    if (reason === 'Mensaje vacio.') {
      return t(language, 'emptyMessage');
    }

    if (reason === 'Indica una estampa, por ejemplo: add arg4.') {
      return t(language, 'stickerRequired');
    }

    return t(language, 'unknownCommand');
  }

  private translateShareRepositoryError(
    error: string | undefined,
    language: BotLanguage,
  ): string | undefined {
    if (!error) {
      return undefined;
    }

    const unknownUserMatch = /^No conozco a @(.+)\./.exec(error);
    const alreadySharedMatch = /^Ya compartes album con @(.+)\./.exec(error);

    if (unknownUserMatch) {
      return t(language, 'shareUnknownUser', { username: unknownUserMatch[1] });
    }

    if (alreadySharedMatch) {
      return t(language, 'shareAlreadyShared', { username: alreadySharedMatch[1] });
    }

    if (error === 'No puedes compartir el album contigo mismo.') {
      return t(language, 'shareSelf');
    }

    if (error === 'Solicitud de album compartido no encontrada.') {
      return t(language, 'shareRequestNotFound');
    }

    if (error === 'Esta solicitud ya fue respondida.') {
      return t(language, 'shareAlreadyAnswered');
    }

    if (error === 'No hay album activo.') {
      return t(language, 'commandRequiresActiveAlbum');
    }

    return error;
  }

  private translateAlbumRepositoryError(
    error: string | undefined,
    language: BotLanguage,
  ): string | undefined {
    if (!error) {
      return undefined;
    }

    if (error === 'Album no encontrado.') {
      return t(language, 'albumNotFound');
    }

    if (error === 'Solo el dueno puede renombrar el album.') {
      return t(language, 'albumOwnerOnlyRename');
    }

    if (error === 'Solo el dueno puede borrar el album.') {
      return t(language, 'albumOwnerOnlyDelete');
    }

    if (error === 'Nombre de album invalido.') {
      return t(language, 'albumNameRequired');
    }

    if (error === 'El dueno no puede salir del album. Debe borrarlo.') {
      return t(language, 'albumCannotLeaveOwned');
    }

    return error;
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
