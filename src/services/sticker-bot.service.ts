import {
  AVAILABLE_ALBUM_TEMPLATES,
  getAlbumTemplate,
} from '../catalog/album-templates.catalog';
import type { AlbumPageEntry } from '../catalog/album-pages.catalog';
import {
  WORLD_CUP_CATALOG,
  formatSticker,
  getAllStickerRefs,
  getCatalogEntry,
  getCatalogTotal,
  getCountryFlag,
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
  type CollectionSummary,
  type CollectionRepository,
  type FriendSummary,
  type StickerHistoryAction,
  type StickerHistoryEntry,
} from '../repositories/collection.repository';
import {
  formatTradeSelector,
  type MarketplaceSearch,
  type TradeOffer,
  type TradePair,
  type TradeSelector,
} from '../trades/trade.types';

export type BotMessageResult = {
  reply: string;
  parsed: ParsedBotMessage;
  replyMarkup?: unknown;
  parseMode?: 'HTML';
  outboundMessages?: BotOutboundMessage[];
};

export type BotActionResult = {
  reply: string;
  replyMarkup?: unknown;
  parseMode?: 'HTML';
  outboundMessages?: BotOutboundMessage[];
};

export type BotOutboundMessage = {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
  parseMode?: 'HTML';
};

type CountryStats = {
  countryCode: string;
  countryName: string;
  total: number;
  owned: StickerRef[];
  missing: StickerRef[];
  percentage: string;
  quantities: Record<string, number>;
};

type TradeCandidate = {
  sticker: StickerRef;
  extraCount: number;
};

const escapeTelegramHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const compressRanges = (nums: number[]): string => {
  if (nums.length === 0) return '—';
  const parts: string[] = [];
  let start = nums[0];
  let end = nums[0];

  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) {
      end = nums[i];
    } else {
      parts.push(start === end ? String(start) : `${start}-${end}`);
      start = end = nums[i];
    }
  }
  parts.push(start === end ? String(start) : `${start}-${end}`);

  return parts.join(' ');
};

export class StickerBotService {
  constructor(private readonly repository: CollectionRepository = collectionRepository) {}

  async registerUser(profile: {
    ownerId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    language?: BotLanguage;
  }): Promise<void> {
    await this.repository.registerProfile(profile);
  }

  async handleMessage(text: string, ownerId = 'default'): Promise<BotMessageResult> {
    const language = await this.getLanguage(ownerId);
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
        ...await this.startMenuReply(ownerId, language),
      };
    }

    if (this.requiresActiveAlbum(parsed) && !await this.repository.hasActiveAlbum(ownerId)) {
      const userAlbums = await this.repository.listAlbums(ownerId);

      if (userAlbums.length === 0) {
        return {
          parsed,
          reply: t(language, 'onboardingWelcome'),
          parseMode: 'HTML',
        };
      }

      const menu = await this.startMenuReply(ownerId, language);

      return {
        parsed,
        reply: `${t(language, 'commandRequiresActiveAlbum')}\n\n${menu.reply}`,
        replyMarkup: menu.replyMarkup,
      };
    }

    if (parsed.intent === 'unknown' && text.trim().length >= 2) {
      const userAlbums = await this.repository.listAlbums(ownerId);

      if (userAlbums.length === 0) {
        const album = await this.repository.createAlbum(
          ownerId,
          AVAILABLE_ALBUM_TEMPLATES[0].slug,
          text.trim(),
        );

        if (album) {
          return {
            parsed,
            reply: `${t(language, 'albumCreated', { albumName: escapeTelegramHtml(album.name) })}\n\n${t(language, 'firstAlbumHint')}`,
            parseMode: 'HTML',
          };
        }
      }
    }

    const result = await this.buildReply(parsed, ownerId, language);

    return {
      parsed,
      ...result,
    };
  }

  async handleCallbackData(callbackData: string, ownerId: string): Promise<BotActionResult> {
    const languageMatch = /^lang:(.+)$/.exec(callbackData);

    if (languageMatch) {
      const language = languageMatch[1];

      if (!isBotLanguage(language)) {
        return { reply: t(await this.getLanguage(ownerId) ?? 'en', 'unknownCallback') };
      }

      await this.repository.setLanguage(ownerId, language);
      const userAlbums = await this.repository.listAlbums(ownerId);

      if (userAlbums.length === 0) {
        return {
          reply: t(language, 'onboardingWelcome'),
          parseMode: 'HTML',
        };
      }

      const menu = await this.startMenuReply(ownerId, language);

      return {
        reply: `${t(language, 'languageSaved')}\n\n${menu.reply}`,
        replyMarkup: menu.replyMarkup,
      };
    }

    const albumDeleteMatch = /^album:delete:([0-9a-f-]{36}):(confirm|cancel)$/i.exec(callbackData);

    if (albumDeleteMatch) {
      const language = await this.getLanguage(ownerId) ?? 'en';

      return albumDeleteMatch[2] === 'confirm'
        ? this.deleteAlbumConfirmed(ownerId, albumDeleteMatch[1], language)
        : { reply: t(language, 'confirmationCancelled') };
    }

    const friendResponseMatch = /^friend:(accept|decline):(.+)$/i.exec(callbackData);

    if (friendResponseMatch) {
      return this.handleFriendResponse(friendResponseMatch[1] as 'accept' | 'decline', friendResponseMatch[2], ownerId);
    }

    const friendRemoveMatch = /^friend:remove:([a-z0-9_]{5,32}):(confirm|cancel)$/i.exec(callbackData);

    if (friendRemoveMatch) {
      const language = await this.getLanguage(ownerId) ?? 'en';

      return friendRemoveMatch[2] === 'confirm'
        ? this.removeFriendConfirmed(ownerId, friendRemoveMatch[1].toLowerCase(), language)
        : { reply: t(language, 'confirmationCancelled') };
    }

    const albumMatch = /^album:(create|select):(.+)$/.exec(callbackData);

    if (albumMatch) {
      const [, action, value] = albumMatch;
      const language = await this.getLanguage(ownerId) ?? 'en';

      if (action === 'create') {
        const album = await this.repository.createAlbum(ownerId, value);

        if (!album) {
          return { reply: t(language, 'unknownAlbumAction') };
        }

        return {
          reply: `${t(language, 'albumCreated', { albumName: escapeTelegramHtml(album.name) })}\n\n${t(language, 'firstAlbumHint')}`,
          parseMode: 'HTML',
        };
      }

      const album = await this.repository.setActiveAlbum(ownerId, value);

      if (!album) {
        return { reply: t(language, 'unknownAlbumAction') };
      }

      return {
        reply: t(language, 'albumSelected', { albumName: album.name }),
      };
    }

    const compareMatch = /^compare:([a-z0-9_]{5,32}):(\d+):([A-Z]{3}|all):([01])$/.exec(callbackData);

    if (compareMatch) {
      const [, targetUsername, albumIndex, countryCode, showNames] = compareMatch;
      const language = await this.getLanguage(ownerId) ?? 'en';

      return this.compareSelectedAlbum(
        ownerId,
        targetUsername,
        Number(albumIndex),
        countryCode === 'all' ? undefined : countryCode,
        showNames === '1',
        language,
      );
    }

    const tradeProposeMatch = /^trade:propose:(T\d+)$/i.exec(callbackData);

    if (tradeProposeMatch) {
      return this.prepareTradeProposal(ownerId, tradeProposeMatch[1].toUpperCase());
    }

    const tradePickGiveMatch = /^trade:pickgive:(T\d+):([A-Z]{3}-\d{1,3})$/i.exec(callbackData);

    if (tradePickGiveMatch) {
      return this.handleTradeGiveSelection(
        ownerId,
        tradePickGiveMatch[1].toUpperCase(),
        tradePickGiveMatch[2].toUpperCase(),
      );
    }

    const tradePickWantMatch = /^trade:pickwant:(T\d+):([A-Z]{3}-\d{1,3})$/i.exec(callbackData);

    if (tradePickWantMatch) {
      return this.handleTradeWantSelection(
        ownerId,
        tradePickWantMatch[1].toUpperCase(),
        tradePickWantMatch[2].toUpperCase(),
      );
    }

    const tradePickPairMatch = /^trade:pickpair:(T\d+):([A-Z]{3}-\d{1,3}):([A-Z]{3}-\d{1,3})$/i.exec(callbackData);

    if (tradePickPairMatch) {
      return this.submitTradeProposal(ownerId, tradePickPairMatch[1].toUpperCase(), {
        give: stickerFromKey(tradePickPairMatch[2].toUpperCase())!,
        want: stickerFromKey(tradePickPairMatch[3].toUpperCase())!,
      });
    }

    const tradeAcceptMatch = /^trade:accept:(T\d+)$/i.exec(callbackData);

    if (tradeAcceptMatch) {
      return this.acceptTradeCoordination(ownerId, tradeAcceptMatch[1].toUpperCase());
    }

    const tradeDeclineMatch = /^trade:decline:(T\d+)$/i.exec(callbackData);

    if (tradeDeclineMatch) {
      return this.declineTradeCoordination(ownerId, tradeDeclineMatch[1].toUpperCase());
    }

    const tradeCompleteMatch = /^trade:complete:(T\d+)$/i.exec(callbackData);

    if (tradeCompleteMatch) {
      return this.confirmTradeCompleted(ownerId, tradeCompleteMatch[1].toUpperCase());
    }

    const tradeCancelMatch = /^trade:cancel:(T\d+)$/i.exec(callbackData);

    if (tradeCancelMatch) {
      return this.cancelTrade(ownerId, tradeCancelMatch[1].toUpperCase());
    }

    return this.handleShareResponse(callbackData, ownerId);
  }

  async handleShareResponse(callbackData: string, ownerId: string): Promise<BotActionResult> {
    const language = await this.getLanguage(ownerId) ?? 'en';
    const match = /^share:(accept|decline):(.+)$/.exec(callbackData);

    if (!match) {
      return { reply: t(language, 'shareInvalid') };
    }

    const [, action, requestId] = match;

    if (action === 'accept') {
      const result = await this.repository.acceptShareRequest(requestId, ownerId);

      if (result.error || !result.request) {
        return { reply: this.translateShareRepositoryError(result.error, language) ?? t(language, 'shareAcceptError') };
      }

      const responderProfile = await this.repository.getProfile(ownerId);
      const responderName = responderProfile?.displayName ?? ownerId;
      const inviterLanguage = await this.getLanguage(result.request.fromOwnerId) ?? language;

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

    const result = await this.repository.declineShareRequest(requestId, ownerId);

    if (result.error || !result.request) {
      return { reply: this.translateShareRepositoryError(result.error, language) ?? t(language, 'shareDeclineError') };
    }

    const responderProfile = await this.repository.getProfile(ownerId);
    const responderName = responderProfile?.displayName ?? ownerId;
    const inviterLanguage = await this.getLanguage(result.request.fromOwnerId) ?? language;

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

  private async buildReply(
    parsed: ParsedBotMessage,
    ownerId: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    switch (parsed.intent) {
      case 'querySticker':
        return { reply: await this.querySticker(ownerId, parsed.sticker, parsed.showNames, language) };
      case 'queryCountry':
        return this.queryCountry(ownerId, parsed.countryCode, parsed.showNames, language);
      case 'addSticker':
        return { reply: await this.addSticker(ownerId, parsed.sticker, parsed.showNames, language) };
      case 'addStickers':
        return {
          reply: await this.addStickers(
            ownerId,
            parsed.stickers,
            parsed.invalidInputs,
            parsed.showNames,
            language,
          ),
        };
      case 'removeSticker':
        return { reply: await this.removeSticker(ownerId, parsed.sticker, parsed.showNames, language) };
      case 'tradeCreate':
        return this.createTrade(ownerId, parsed.give, parsed.want);
      case 'tradeListMine':
        return this.listMyTrades(ownerId);
      case 'tradeCancel':
        return this.cancelTrade(ownerId, parsed.tradeId);
      case 'marketplaceSearch':
        return this.searchMarketplace(ownerId, parsed.search);
      case 'missing':
        return { reply: await this.showMissing(ownerId, parsed.countryCode, parsed.showNames, language) };
      case 'duplicates':
        return {
          reply: parsed.targetUsername
            ? await this.showUserDuplicates(
              ownerId,
              parsed.targetUsername,
              parsed.countryCode,
              parsed.sticker,
              parsed.showNames,
              language,
            )
            : await this.showDuplicates(ownerId, parsed.countryCode, parsed.sticker, parsed.showNames, language),
        };
      case 'friendsList':
        return { reply: await this.listFriends(ownerId, language) };
      case 'friendAdd':
        return this.addFriend(ownerId, parsed.targetUsername, language);
      case 'friendRemove':
        return this.confirmRemoveFriend(ownerId, parsed.targetUsername, language);
      case 'friendsDuplicates':
        return {
          reply: await this.showFriendsDuplicates(ownerId, parsed.countryCode, parsed.sticker, parsed.showNames, language),
        };
      case 'progress':
        return { reply: await this.showProgress(ownerId, language) };
      case 'page':
        return { reply: this.showAlbumPage(parsed.country, parsed.countryInput, language) };
      case 'share':
        return this.shareAlbum(ownerId, parsed.targetUsername, language);
      case 'compare':
        return this.compareUser(
          ownerId,
          parsed.targetUsername,
          parsed.countryCode,
          parsed.showNames,
          language,
        );
      case 'albumList':
        return this.albumListReply(ownerId, language);
      case 'albumCreate':
        return this.createAlbum(ownerId, parsed.albumName, language);
      case 'albumSelect':
        return this.selectAlbum(ownerId, parsed.selector, language);
      case 'albumRename':
        return this.renameAlbum(ownerId, parsed.albumName, parsed.selector, language);
      case 'albumDelete':
        return this.deleteAlbum(ownerId, parsed.selector, language);
      case 'albumLeave':
        return this.leaveAlbum(ownerId, language);
      case 'start':
        return this.startMenuReply(ownerId, language);
      case 'language':
        return this.languageSelectionReply();
      case 'undo':
        return { reply: await this.undoLast(ownerId, language) };
      case 'help':
        return this.helpReply(language);
      case 'unknown': {
        const parseError = escapeTelegramHtml(this.translateParseError(parsed.reason, language));

        return {
          reply: `${parseError}\n\n${t(language, 'unknownCommandHint')}`,
          parseMode: 'HTML',
        };
      }
    }
  }

  private helpReply(language: BotLanguage): BotActionResult {
    return {
      reply: t(language, 'help'),
      parseMode: 'HTML',
    };
  }

  private async createTrade(
    ownerId: string,
    give: TradeSelector,
    want: TradeSelector,
  ): Promise<BotActionResult> {
    const result = await this.repository.createTradeOffer(ownerId, give, want);

    if (result.error || !result.offer) {
      return {
        reply: result.error ?? 'Could not post the trade.',
      };
    }

    return {
      reply: `Trade posted: you give ${formatTradeSelector(give)} and want ${formatTradeSelector(want)}.`,
    };
  }

  private async listMyTrades(ownerId: string): Promise<BotActionResult> {
    const offers = await this.repository.listTradeOffersForOwner(ownerId);

    if (offers.length === 0) {
      return { reply: 'You have no active or pending trades.' };
    }

    const lines = ['Your trades:'];

    for (const offer of offers) {
      lines.push(await this.formatTradeOfferForOwner(offer));
    }

    return {
      reply: lines.join('\n\n'),
      replyMarkup: this.buildOwnerTradeKeyboard(offers),
    };
  }

  private async cancelTrade(ownerId: string, tradeId: string): Promise<BotActionResult> {
    const existingOffer = await this.repository.getTradeOffer(tradeId);
    const result = await this.repository.cancelTradeOffer(ownerId, tradeId);

    if (result.error || !result.offer) {
      return {
        reply: result.error ?? 'Could not cancel the trade.',
      };
    }

    const outboundMessages = existingOffer?.reservedByOwnerId
      ? [
        {
          chatId: existingOffer.reservedByOwnerId,
          text: `Trade ${tradeId} was cancelled by ${await this.getDisplayName(ownerId)}.`,
        },
      ]
      : undefined;

    return {
      reply: `Trade cancelled: #${result.offer.id}.`,
      outboundMessages,
    };
  }

  private async searchMarketplace(ownerId: string, search: MarketplaceSearch): Promise<BotActionResult> {
    const offers = await this.repository.listMarketplaceTradeOffers(ownerId, search);

    if (offers.length === 0) {
      return {
        reply: search.mineOnly
          ? 'You have no active marketplace offers.'
          : search.friendsOnly
            ? 'No active friend trades found.'
          : 'No active trades found.',
      };
    }

    const lines = [
      search.mineOnly
        ? 'Your marketplace offers:'
        : search.friendsOnly
          ? 'Friends marketplace:'
          : 'Marketplace:',
    ];

    for (const offer of offers) {
      lines.push(await this.formatMarketplaceTradeOffer(offer));
    }

    return {
      reply: lines.join('\n\n'),
      replyMarkup: search.mineOnly
        ? this.buildOwnerMarketplaceKeyboard(offers)
        : this.buildMarketplaceKeyboard(offers),
    };
  }

  private async prepareTradeProposal(ownerId: string, tradeId: string): Promise<BotActionResult> {
    const compatibility = await this.repository.getCompatibleTradePairs(tradeId, ownerId);

    if (compatibility.error || !compatibility.offer || !compatibility.pairs) {
      return { reply: compatibility.error ?? 'Could not prepare this trade.' };
    }

    const offer = compatibility.offer;
    const hasGiveWildcard = offer.give.kind !== 'sticker';
    const hasWantWildcard = offer.want.kind !== 'sticker';
    const explicitWant = offer.want.kind === 'sticker' ? offer.want.sticker : undefined;
    const explicitGive = offer.give.kind === 'sticker' ? offer.give.sticker : undefined;

    if (!hasGiveWildcard && !hasWantWildcard) {
      return this.submitTradeProposal(ownerId, tradeId, compatibility.pairs[0]!);
    }

    if (hasGiveWildcard) {
      const giveChoices = this.uniqueStickers(
        compatibility.pairs.map((pair) => pair.give),
      );

      return {
        reply: hasWantWildcard
          ? `Choose the sticker you want to receive from #${offer.id}.`
          : `Choose the sticker you want to receive from #${offer.id}. You will give ${formatSticker(explicitWant!)}.`,
        replyMarkup: {
          inline_keyboard: giveChoices.map((sticker) => [
            {
              text: formatSticker(sticker),
              callback_data: `trade:pickgive:${offer.id}:${stickerKey(sticker)}`,
            },
          ]),
        },
      };
    }

    const wantChoices = this.uniqueStickers(
      compatibility.pairs.map((pair) => pair.want),
    );

    return {
      reply: `Choose the sticker you will give for #${offer.id}. You will receive ${formatSticker(explicitGive!)}.`,
      replyMarkup: {
        inline_keyboard: wantChoices.map((sticker) => [
          {
            text: formatSticker(sticker),
            callback_data: `trade:pickwant:${offer.id}:${stickerKey(sticker)}`,
          },
        ]),
      },
    };
  }

  private async handleTradeGiveSelection(ownerId: string, tradeId: string, giveKey: string): Promise<BotActionResult> {
    const selectedGive = stickerFromKey(giveKey);

    if (!selectedGive) {
      return { reply: 'Invalid sticker selection.' };
    }

    const compatibility = await this.repository.getCompatibleTradePairs(tradeId, ownerId);

    if (compatibility.error || !compatibility.offer || !compatibility.pairs) {
      return { reply: compatibility.error ?? 'Could not prepare this trade.' };
    }

    const matchingPairs = compatibility.pairs.filter(
      (pair) => stickerKey(pair.give) === giveKey,
    );

    if (matchingPairs.length === 0) {
      return { reply: 'That sticker is no longer available for this trade.' };
    }

    if (compatibility.offer.want.kind === 'sticker') {
      return this.submitTradeProposal(ownerId, tradeId, matchingPairs[0]);
    }

    const wantChoices = this.uniqueStickers(matchingPairs.map((pair) => pair.want));

    return {
      reply: `Choose the sticker you will give in exchange for ${formatSticker(selectedGive)}.`,
      replyMarkup: {
        inline_keyboard: wantChoices.map((sticker) => [
          {
            text: formatSticker(sticker),
            callback_data: `trade:pickpair:${tradeId}:${giveKey}:${stickerKey(sticker)}`,
          },
        ]),
      },
    };
  }

  private async handleTradeWantSelection(ownerId: string, tradeId: string, wantKey: string): Promise<BotActionResult> {
    const selectedWant = stickerFromKey(wantKey);

    if (!selectedWant) {
      return { reply: 'Invalid sticker selection.' };
    }

    const compatibility = await this.repository.getCompatibleTradePairs(tradeId, ownerId);

    if (compatibility.error || !compatibility.offer || !compatibility.pairs) {
      return { reply: compatibility.error ?? 'Could not prepare this trade.' };
    }

    const matchingPairs = compatibility.pairs.filter(
      (pair) => stickerKey(pair.want) === wantKey,
    );

    if (matchingPairs.length === 0) {
      return { reply: 'That sticker is no longer available for this trade.' };
    }

    if (compatibility.offer.give.kind !== 'sticker') {
      return { reply: 'Choose the sticker you want to receive first.' };
    }

    return this.submitTradeProposal(ownerId, tradeId, {
      give: compatibility.offer.give.sticker,
      want: selectedWant,
    });
  }

  private async submitTradeProposal(ownerId: string, tradeId: string, pair: TradePair): Promise<BotActionResult> {
    const result = await this.repository.reserveTradeOffer(tradeId, ownerId, pair);

    if (result.error || !result.offer || !result.offer.resolvedGive || !result.offer.resolvedWant) {
      return { reply: result.error ?? 'Could not submit the trade proposal.' };
    }

    const ownerDisplayName = await this.getDisplayName(result.offer.ownerId);
    const takerDisplayName = await this.getDisplayName(ownerId);

    return {
      reply: `Trade proposal sent to ${ownerDisplayName}.`,
      outboundMessages: [
        {
          chatId: result.offer.ownerId,
          text: `${takerDisplayName} wants to take your trade: you give ${formatSticker(result.offer.resolvedGive)}, they give ${formatSticker(result.offer.resolvedWant)}.`,
          replyMarkup: {
            inline_keyboard: [[
              {
                text: 'Accept coordination',
                callback_data: `trade:accept:${result.offer.id}`,
              },
              {
                text: 'Decline',
                callback_data: `trade:decline:${result.offer.id}`,
              },
            ]],
          },
        },
      ],
    };
  }

  private async acceptTradeCoordination(ownerId: string, tradeId: string): Promise<BotActionResult> {
    const result = await this.repository.acceptTradeOffer(tradeId, ownerId);

    if (result.error || !result.offer || !result.offer.reservedByOwnerId) {
      return { reply: result.error ?? 'Could not accept coordination.' };
    }

    return {
      reply: 'Coordination accepted. Press Trade completed after the in-person swap.',
      replyMarkup: this.buildTradeCompletedKeyboard(result.offer.id),
      outboundMessages: [
        {
          chatId: result.offer.reservedByOwnerId,
          text: `${await this.getDisplayName(ownerId)} accepted coordination for trade #${result.offer.id}. Press Trade completed after the in-person swap.`,
          replyMarkup: this.buildTradeCompletedKeyboard(result.offer.id),
        },
      ],
    };
  }

  private async declineTradeCoordination(ownerId: string, tradeId: string): Promise<BotActionResult> {
    const existingOffer = await this.repository.getTradeOffer(tradeId);
    const result = await this.repository.declineTradeOffer(tradeId, ownerId);

    if (result.error || !result.offer) {
      return { reply: result.error ?? 'Could not decline coordination.' };
    }

    return {
      reply: `Trade proposal declined for #${result.offer.id}.`,
      outboundMessages: existingOffer?.reservedByOwnerId
        ? [
          {
            chatId: existingOffer.reservedByOwnerId,
            text: `${await this.getDisplayName(ownerId)} declined your proposal for trade #${tradeId}.`,
          },
        ]
        : undefined,
    };
  }

  private async confirmTradeCompleted(ownerId: string, tradeId: string): Promise<BotActionResult> {
    const result = await this.repository.confirmTradeOfferCompleted(tradeId, ownerId);

    if (result.error || !result.offer) {
      return { reply: result.error ?? 'Could not confirm completion.' };
    }

    const counterpartOwnerId = result.offer.ownerId === ownerId
      ? result.offer.reservedByOwnerId
      : result.offer.ownerId;

    if (result.completed) {
      return {
        reply: 'Trade completed. Inventory updated.',
        outboundMessages: counterpartOwnerId
          ? [
            {
              chatId: counterpartOwnerId,
              text: 'Trade completed. Inventory updated.',
            },
          ]
          : undefined,
      };
    }

    if (result.waitingForOther) {
      return {
        reply: result.alreadyConfirmed
          ? 'Completion already confirmed. Waiting for the other person.'
          : 'Completion confirmed. Waiting for the other person.',
        replyMarkup: this.buildTradeCompletedKeyboard(tradeId),
        outboundMessages: !result.alreadyConfirmed && counterpartOwnerId
          ? [
            {
              chatId: counterpartOwnerId,
              text: `${await this.getDisplayName(ownerId)} marked trade #${tradeId} as completed. Confirm when your in-person swap is done.`,
              replyMarkup: this.buildTradeCompletedKeyboard(tradeId),
            },
          ]
          : undefined,
      };
    }

    return { reply: 'Completion updated.' };
  }

  private async formatMarketplaceTradeOffer(offer: TradeOffer): Promise<string> {
    const ownerDisplayName = await this.getDisplayName(offer.ownerId);
    const collection = await this.repository.getCollectionSummaryById(offer.collectionId);
    const header = `#${offer.id} ${ownerDisplayName} gives ${formatTradeSelector(offer.give)} for ${formatTradeSelector(offer.want)}`;
    const metadata = [
      collection ? `Album: ${collection.name}` : undefined,
      `Created: ${this.formatShortDate(offer.createdAt)}`,
    ].filter(Boolean).join(' | ');

    return `${header}\n${metadata}`;
  }

  private async formatTradeOfferForOwner(offer: TradeOffer): Promise<string> {
    const collection = await this.repository.getCollectionSummaryById(offer.collectionId);
    const status = offer.status === 'active'
      ? await this.repository.isTradeOfferCurrentlyValid(offer.id)
        ? 'active'
        : 'active, hidden'
      : offer.status === 'pending_confirmation'
        ? 'pending confirmation'
        : 'accepted, waiting completion';
    const lines = [
      `#${offer.id} [${status}] you give ${formatTradeSelector(offer.give)} and want ${formatTradeSelector(offer.want)}`,
      [
        collection ? `Album: ${collection.name}` : undefined,
        `Created: ${this.formatShortDate(offer.createdAt)}`,
      ].filter(Boolean).join(' | '),
    ];

    if (offer.status === 'pending_confirmation' && offer.resolvedGive && offer.resolvedWant && offer.reservedByOwnerId) {
      lines.push(
        `${await this.getDisplayName(offer.reservedByOwnerId)} proposes: you give ${formatSticker(offer.resolvedGive)}, they give ${formatSticker(offer.resolvedWant)}.`,
      );
    }

    if (offer.status === 'accepted_pending_completion' && offer.resolvedGive && offer.resolvedWant) {
      lines.push(
        `Accepted pair: you give ${formatSticker(offer.resolvedGive)} and receive ${formatSticker(offer.resolvedWant)}.`,
      );
    }

    return lines.join('\n');
  }

  private buildMarketplaceKeyboard(offers: TradeOffer[]): unknown {
    return {
      inline_keyboard: offers.map((offer) => [
        {
          text: `Propose trade #${offer.id}`,
          callback_data: `trade:propose:${offer.id}`,
        },
      ]),
    };
  }

  private buildOwnerMarketplaceKeyboard(offers: TradeOffer[]): unknown {
    return {
      inline_keyboard: offers.map((offer) => [
        {
          text: `Cancel #${offer.id}`,
          callback_data: `trade:cancel:${offer.id}`,
        },
      ]),
    };
  }

  private buildOwnerTradeKeyboard(offers: TradeOffer[]): unknown | undefined {
    const rows = offers.flatMap((offer) => {
      if (offer.status === 'active') {
        return [[
          {
            text: `Cancel #${offer.id}`,
            callback_data: `trade:cancel:${offer.id}`,
          },
        ]];
      }

      if (offer.status === 'pending_confirmation') {
        return [
          [
            {
              text: `Accept #${offer.id}`,
              callback_data: `trade:accept:${offer.id}`,
            },
            {
              text: `Decline #${offer.id}`,
              callback_data: `trade:decline:${offer.id}`,
            },
          ],
          [
            {
              text: `Cancel #${offer.id}`,
              callback_data: `trade:cancel:${offer.id}`,
            },
          ],
        ];
      }

      if (offer.status === 'accepted_pending_completion') {
        return [[
          {
            text: `Trade completed #${offer.id}`,
            callback_data: `trade:complete:${offer.id}`,
          },
        ]];
      }

      return [];
    });

    return rows.length > 0
      ? { inline_keyboard: rows }
      : undefined;
  }

  private buildTradeCompletedKeyboard(tradeId: string): unknown {
    return {
      inline_keyboard: [[
        {
          text: 'Trade completed',
          callback_data: `trade:complete:${tradeId}`,
        },
      ]],
    };
  }

  private uniqueStickers(stickers: StickerRef[]): StickerRef[] {
    const map = new Map<string, StickerRef>();

    for (const sticker of stickers) {
      map.set(stickerKey(sticker), sticker);
    }

    return sortStickers([...map.values()]);
  }

  private async getDisplayName(ownerId: string | undefined): Promise<string> {
    if (!ownerId) {
      return 'Unknown user';
    }

    return (await this.repository.getProfile(ownerId))?.displayName ?? ownerId;
  }

  private formatShortDate(timestamp: string): string {
    return timestamp.slice(0, 10);
  }

  private async querySticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const quantity = await this.repository.getQuantity(ownerId, sticker);
    const label = formatSticker(sticker, { includeName: showNames });

    if (quantity <= 0) {
      return t(language, 'stickerNotOwned', { label });
    }

    return t(language, 'stickerOwned', { label, quantity });
  }

  private async queryCountry(
    ownerId: string,
    countryCode: string,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const stats = await this.getCountryStats(ownerId, countryCode);

    if (!stats) {
      return { reply: t(language, 'unknownCountry', { country: countryCode }) };
    }

    const country = getCatalogEntry(stats.countryCode)!;
    const totalDuplicates = stats.owned.reduce((sum, sticker) => {
      const qty = stats.quantities[stickerKey(sticker)] ?? 0;

      return sum + Math.max(qty - 1, 0);
    }, 0);

    const summaryParts = [
      t(language, 'countryProgress', {
        owned: stats.owned.length,
        total: stats.total,
        percentage: stats.percentage,
      }),
    ];

    if (totalDuplicates > 0) {
      summaryParts.push(t(language, 'countryDuplicates', { duplicates: totalDuplicates }));
    }

    const header = [
      t(language, 'countryHeader', {
        flag: getCountryFlag(stats.countryCode),
        countryCode: stats.countryCode,
        countryName: stats.countryName,
      }),
      summaryParts.join(' · '),
    ].join('\n');

    const numWidth = String(stats.total).length;
    const rows: string[] = [];

    for (let i = 1; i <= stats.total; i++) {
      const sticker: StickerRef = { countryCode: stats.countryCode, number: i };
      const qty = stats.quantities[stickerKey(sticker)] ?? 0;
      const name = showNames ? country.names[i] : undefined;
      const numStr = `${stats.countryCode} ${String(i).padStart(numWidth, '⠀')}`;
      const nameStr = name ? ` ${name}` : '';

      if (qty > 0) {
        const dupeStr = qty > 1 ? ` ×${qty}` : '';
        rows.push(`${numStr}${nameStr} ✅${dupeStr}`);
      } else {
        rows.push(`${numStr}${nameStr} ❌`);
      }
    }

    return {
      reply: `${header}\n\n${rows.join('\n')}`,
      parseMode: 'HTML',
    };
  }

  private async addSticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new AddStickerCommand(this.repository, ownerId, sticker);
    const result = await command.execute();
    const label = formatSticker(sticker, { includeName: showNames });

    if (!result.changed) {
      return t(language, 'stickerUnavailable', { label });
    }

    await this.recordHistory(ownerId, 'add', result);

    const duplicateText = result.currentQuantity > 1
      ? t(language, 'duplicateSuffix', { count: result.currentQuantity - 1 })
      : '';

    return t(language, 'stickerAdded', {
      label,
      quantity: result.currentQuantity,
      duplicateText,
    });
  }

  private showAlbumPage(
    country: AlbumPageEntry | undefined,
    countryInput: string | undefined,
    language: BotLanguage,
  ): string {
    if (!countryInput) {
      return t(language, 'albumPageRequired');
    }

    if (!country) {
      return t(language, 'albumPageUnknown', { country: countryInput.toUpperCase() });
    }

    return t(language, 'albumPage', {
      countryName: country.name,
      countryCode: country.code,
      page: country.page,
    });
  }

  private async addStickers(
    ownerId: string,
    stickers: StickerRef[],
    invalidInputs: string[],
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const replies: string[] = [];

    for (const sticker of stickers) {
      replies.push(await this.addSticker(ownerId, sticker, showNames, language));
    }

    for (const invalidInput of invalidInputs) {
      replies.push(`${invalidInput}: ${t(language, 'stickerRequired')}`);
    }

    return replies.join('\n');
  }

  private async removeSticker(
    ownerId: string,
    sticker: StickerRef,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const validationMessage = this.validateSticker(sticker, language);

    if (validationMessage) {
      return validationMessage;
    }

    const command = new RemoveStickerCommand(this.repository, ownerId, sticker);
    const result = await command.execute();
    const label = formatSticker(sticker, { includeName: showNames });

    if (!result.changed) {
      return t(language, 'cannotRemove', { label });
    }

    await this.recordHistory(ownerId, 'remove', result);

    return t(language, 'stickerRemoved', {
      label,
      quantity: result.currentQuantity,
    });
  }

  private async undoLast(ownerId: string, language: BotLanguage): Promise<string> {
    const entry = await this.repository.undoLast(ownerId);

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

  private async showMissing(
    ownerId: string,
    countryCode: string | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    if (!countryCode) {
      return t(language, 'missingNeedsCountry');
    }

    const stats = await this.getCountryStats(ownerId, countryCode);

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

  private async showDuplicates(
    ownerId: string,
    countryCode: string | undefined,
    sticker: StickerRef | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const duplicates = this.getDuplicateEntries(await this.repository.getStickerQuantities(ownerId), countryCode, sticker);

    if (duplicates.length === 0) {
      if (sticker) {
        return `You do not have duplicates of ${formatSticker(sticker, { includeName: showNames })}.`;
      }

      return countryCode
        ? t(language, 'duplicatesCountryNone', { countryCode })
        : t(language, 'duplicatesNone');
    }

    return t(language, 'duplicatesList', {
      stickers: this.formatDuplicateEntries(duplicates, showNames),
    });
  }

  private async showUserDuplicates(
    ownerId: string,
    targetUsername: string,
    countryCode: string | undefined,
    sticker: StickerRef | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const targetProfile = await this.repository.findProfileByUsername(targetUsername);

    if (!targetProfile) {
      return t(language, 'compareUnknownUser', { username: targetUsername });
    }

    if (targetProfile.ownerId === ownerId) {
      return await this.showDuplicates(ownerId, countryCode, sticker, showNames, language);
    }

    if (!await this.repository.areFriends(ownerId, targetProfile.ownerId)) {
      return t(language, 'friendNotFriends', { username: targetProfile.displayName ?? `@${targetUsername}` });
    }

    if (!await this.repository.hasActiveAlbum(targetProfile.ownerId)) {
      return t(language, 'compareNoTargetAlbums', { username: targetProfile.displayName ?? `@${targetUsername}` });
    }

    const duplicates = this.getDuplicateEntries(
      await this.repository.getStickerQuantities(targetProfile.ownerId),
      countryCode,
      sticker,
    );
    const displayName = targetProfile.displayName ?? `@${targetUsername}`;

    if (duplicates.length === 0) {
      return t(language, 'friendDuplicatesNone', { username: displayName });
    }

    return t(language, 'friendDuplicatesList', {
      username: displayName,
      stickers: this.formatDuplicateEntries(duplicates, showNames),
    });
  }

  private async showFriendsDuplicates(
    ownerId: string,
    countryCode: string | undefined,
    sticker: StickerRef | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<string> {
    const overview = await this.repository.listFriendOverview(ownerId);

    if (overview.friends.length === 0) {
      return t(language, 'friendsNone');
    }

    const lines = [t(language, 'friendsDuplicatesTitle')];

    for (const friend of overview.friends) {
      if (!await this.repository.hasActiveAlbum(friend.ownerId)) {
        continue;
      }

      const duplicates = this.getDuplicateEntries(
        await this.repository.getStickerQuantities(friend.ownerId),
        countryCode,
        sticker,
      );

      if (duplicates.length > 0) {
        lines.push(`${friend.displayName ?? friend.ownerId}: ${this.formatDuplicateEntries(duplicates, showNames)}`);
      }
    }

    if (lines.length === 1) {
      return t(language, 'friendsDuplicatesNone');
    }

    return lines.join('\n');
  }

  private getDuplicateEntries(
    quantities: Record<string, number>,
    countryCode: string | undefined,
    sticker: StickerRef | undefined,
  ): { sticker: StickerRef; quantity: number }[] {
    const stickerFilterKey = sticker ? stickerKey(sticker) : undefined;

    return Object.entries(quantities)
      .map(([key, quantity]) => ({
        sticker: stickerFromKey(key),
        quantity,
        key,
      }))
      .filter((entry): entry is { sticker: StickerRef; quantity: number; key: string } =>
        Boolean(entry.sticker && entry.quantity > 1),
      )
      .filter((entry) => !countryCode || entry.sticker.countryCode === countryCode)
      .filter((entry) => !stickerFilterKey || entry.key === stickerFilterKey)
      .sort((left, right) => sortStickers([left.sticker, right.sticker])[0] === left.sticker ? -1 : 1);
  }

  private formatDuplicateEntries(
    duplicates: { sticker: StickerRef; quantity: number }[],
    showNames: boolean,
  ): string {
    return duplicates
      .map((entry) => `${formatSticker(entry.sticker, { includeName: showNames })} x${entry.quantity}`)
      .join(', ');
  }

  private async showProgress(ownerId: string, language: BotLanguage): Promise<string> {
    const quantities = await this.repository.getStickerQuantities(ownerId);
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

  private async shareAlbum(
    ownerId: string,
    targetUsername: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const result = await this.repository.createShareRequest(ownerId, targetUsername);

    if (result.error || !result.request) {
      return {
        reply: this.translateShareRepositoryError(result.error, language)
          ?? t(language, 'shareAcceptError'),
      };
    }

    const fromProfile = await this.repository.getProfile(ownerId);
    const inviterName = fromProfile?.displayName ?? ownerId;
    const recipientLanguage = await this.getLanguage(result.request.toOwnerId) ?? language;

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

  private async listFriends(ownerId: string, language: BotLanguage): Promise<string> {
    const overview = await this.repository.listFriendOverview(ownerId);
    const lines = [t(language, 'friendsTitle')];

    if (overview.friends.length === 0) {
      lines.push(t(language, 'friendsNone'));
    } else {
      lines.push(...overview.friends.map((friend) => `- ${friend.displayName ?? friend.ownerId}`));
    }

    if (overview.incomingRequests.length > 0) {
      lines.push('', t(language, 'friendsIncomingTitle'));
      lines.push(...overview.incomingRequests.map((request) => `- @${request.fromUsername ?? request.fromOwnerId}`));
    }

    if (overview.outgoingRequests.length > 0) {
      lines.push('', t(language, 'friendsOutgoingTitle'));
      lines.push(...overview.outgoingRequests.map((request) => `- @${request.targetUsername}`));
    }

    return lines.join('\n');
  }

  private async addFriend(
    ownerId: string,
    targetUsername: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const result = await this.repository.createFriendRequest(ownerId, targetUsername);

    if (result.error || !result.request) {
      return {
        reply: this.translateFriendRepositoryError(result.error, language)
          ?? t(language, 'friendRequestFailed'),
      };
    }

    const fromProfile = await this.repository.getProfile(ownerId);
    const inviterName = fromProfile?.displayName ?? ownerId;
    const recipientLanguage = await this.getLanguage(result.request.toOwnerId) ?? language;

    return {
      reply: t(language, 'friendRequestSent', { username: `@${targetUsername}` }),
      outboundMessages: [
        {
          chatId: result.request.toOwnerId,
          text: t(recipientLanguage, 'friendInvite', { inviterName }),
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: t(recipientLanguage, 'buttonYes'),
                  callback_data: `friend:accept:${result.request.id}`,
                },
                {
                  text: t(recipientLanguage, 'buttonNo'),
                  callback_data: `friend:decline:${result.request.id}`,
                },
              ],
            ],
          },
        },
      ],
    };
  }

  private async handleFriendResponse(
    action: 'accept' | 'decline',
    requestId: string,
    ownerId: string,
  ): Promise<BotActionResult> {
    const language = await this.getLanguage(ownerId) ?? 'en';
    const result = action === 'accept'
      ? await this.repository.acceptFriendRequest(requestId, ownerId)
      : await this.repository.declineFriendRequest(requestId, ownerId);

    if (result.error || !result.request) {
      return {
        reply: this.translateFriendRepositoryError(result.error, language)
          ?? t(language, 'friendRequestFailed'),
      };
    }

    const responderName = (await this.repository.getProfile(ownerId))?.displayName ?? ownerId;
    const outboundMessages = result.fromProfile
      ? [
        {
          chatId: result.request.fromOwnerId,
          text: action === 'accept'
            ? t(result.fromProfile.language ?? language, 'friendAcceptedNotify', { responderName })
            : t(result.fromProfile.language ?? language, 'friendDeclinedNotify', { responderName }),
        },
      ]
      : undefined;

    return {
      reply: action === 'accept'
        ? t(language, 'friendAccepted')
        : t(language, 'friendDeclined'),
      outboundMessages,
    };
  }

  private async confirmRemoveFriend(
    ownerId: string,
    targetUsername: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const targetProfile = await this.repository.findProfileByUsername(targetUsername);

    if (!targetProfile) {
      return { reply: t(language, 'compareUnknownUser', { username: targetUsername }) };
    }

    if (!await this.repository.areFriends(ownerId, targetProfile.ownerId)) {
      return { reply: t(language, 'friendNotFriends', { username: targetProfile.displayName ?? `@${targetUsername}` }) };
    }

    return {
      reply: t(language, 'friendRemoveConfirm', { username: targetProfile.displayName ?? `@${targetUsername}` }),
      replyMarkup: {
        inline_keyboard: [[
          {
            text: t(language, 'buttonYes'),
            callback_data: `friend:remove:${targetUsername}:confirm`,
          },
          {
            text: t(language, 'buttonNo'),
            callback_data: `friend:remove:${targetUsername}:cancel`,
          },
        ]],
      },
    };
  }

  private async removeFriendConfirmed(
    ownerId: string,
    targetUsername: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const result = await this.repository.removeFriend(ownerId, targetUsername);

    if (result.error || !result.friend) {
      return {
        reply: this.translateFriendRepositoryError(result.error, language)
          ?? t(language, 'friendRemoveFailed'),
      };
    }

    return {
      reply: t(language, 'friendRemoved', { username: result.friend.displayName ?? `@${targetUsername}` }),
    };
  }

  private async compareUser(
    ownerId: string,
    targetUsername: string,
    countryCode: string | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const targetProfile = await this.repository.findProfileByUsername(targetUsername);

    if (!targetProfile) {
      return {
        reply: t(language, 'compareUnknownUser', { username: targetUsername }),
      };
    }

    if (targetProfile.ownerId === ownerId) {
      return { reply: t(language, 'compareSelf') };
    }

    const targetAlbums = await this.repository.listAlbums(targetProfile.ownerId);
    const targetDisplayName = targetProfile.displayName ?? `@${targetUsername}`;

    if (targetAlbums.length === 0) {
      return {
        reply: t(language, 'compareNoTargetAlbums', { username: targetDisplayName }),
      };
    }

    return {
      reply: t(language, 'compareChooseAlbum', { username: targetDisplayName }),
      replyMarkup: {
        inline_keyboard: targetAlbums.map((album, index) => [
          {
            text: `${index + 1}. ${album.name}`,
            callback_data: [
              'compare',
              targetUsername,
              String(index + 1),
              countryCode ?? 'all',
              showNames ? '1' : '0',
            ].join(':'),
          },
        ]),
      },
    };
  }

  private async compareSelectedAlbum(
    ownerId: string,
    targetUsername: string,
    albumIndex: number,
    countryCode: string | undefined,
    showNames: boolean,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const targetProfile = await this.repository.findProfileByUsername(targetUsername);

    if (!targetProfile) {
      return {
        reply: t(language, 'compareUnknownUser', { username: targetUsername }),
      };
    }

    const targetAlbum = (await this.repository.listAlbums(targetProfile.ownerId))[albumIndex - 1];

    if (!targetAlbum) {
      return { reply: t(language, 'compareAlbumNotFound') };
    }

    const targetSnapshot = await this.repository.getAlbumSnapshot(targetProfile.ownerId, targetAlbum.id);
    const activeAlbum = await this.repository.getActiveAlbum(ownerId);

    if (!activeAlbum) {
      return { reply: t(language, 'commandRequiresActiveAlbum') };
    }

    if (!targetSnapshot) {
      return { reply: t(language, 'compareAlbumNotFound') };
    }

    return {
      reply: this.buildCompareReply({
        activeAlbum,
        activeQuantities: await this.repository.getStickerQuantities(ownerId),
        targetAlbum: targetSnapshot.album,
        targetDisplayName: targetProfile.displayName ?? `@${targetUsername}`,
        targetQuantities: targetSnapshot.stickerQuantities,
        countryCode,
        showNames,
        language,
      }),
    };
  }

  private buildCompareReply(options: {
    activeAlbum: CollectionSummary;
    activeQuantities: Record<string, number>;
    targetAlbum: CollectionSummary;
    targetDisplayName: string;
    targetQuantities: Record<string, number>;
    countryCode?: string;
    showNames: boolean;
    language: BotLanguage;
  }): string {
    const targetCanGive = this.findDuplicateMissingMatches(
      options.targetQuantities,
      options.activeQuantities,
      options.countryCode,
    );
    const activeCanGive = this.findDuplicateMissingMatches(
      options.activeQuantities,
      options.targetQuantities,
      options.countryCode,
    );
    const lines = [
      t(options.language, 'compareTitle', {
        yourAlbum: options.activeAlbum.name,
        otherAlbum: options.targetAlbum.name,
        username: options.targetDisplayName,
      }),
      options.countryCode
        ? t(options.language, 'compareCountryScope', { countryCode: options.countryCode })
        : t(options.language, 'compareAllCountriesScope'),
    ];

    if (targetCanGive.length === 0 && activeCanGive.length === 0) {
      lines.push(t(options.language, 'compareNoMatches'));

      return lines.join('\n');
    }

    lines.push(t(options.language, 'compareTheyCanGive', {
      username: options.targetDisplayName,
      stickers: this.formatTradeCandidateList(targetCanGive, options.showNames, options.language),
    }));
    lines.push(t(options.language, 'compareYouCanGive', {
      username: options.targetDisplayName,
      stickers: this.formatTradeCandidateList(activeCanGive, options.showNames, options.language),
    }));

    return lines.join('\n');
  }

  private findDuplicateMissingMatches(
    sourceQuantities: Record<string, number>,
    targetQuantities: Record<string, number>,
    countryCode: string | undefined,
  ): TradeCandidate[] {
    return Object.entries(sourceQuantities)
      .map(([key, quantity]) => ({
        sticker: stickerFromKey(key),
        quantity,
        key,
      }))
      .filter((entry): entry is { sticker: StickerRef; quantity: number; key: string } =>
        Boolean(entry.sticker && isKnownSticker(entry.sticker)),
      )
      .filter((entry) =>
        entry.quantity > 1
        && (targetQuantities[entry.key] ?? 0) <= 0
        && (!countryCode || entry.sticker.countryCode === countryCode),
      )
      .map((entry) => ({
        sticker: entry.sticker,
        extraCount: entry.quantity - 1,
      }))
      .sort((left, right) => {
        const countryComparison = left.sticker.countryCode.localeCompare(right.sticker.countryCode);

        return countryComparison || left.sticker.number - right.sticker.number;
      });
  }

  private formatTradeCandidateList(
    candidates: TradeCandidate[],
    showNames: boolean,
    language: BotLanguage,
  ): string {
    if (candidates.length === 0) {
      return t(language, 'compareNone');
    }

    return candidates
      .map((candidate) =>
        `${formatSticker(candidate.sticker, { includeName: showNames })} x${candidate.extraCount}`,
      )
      .join(', ');
  }

  private async getCountryStats(ownerId: string, countryCode: string): Promise<CountryStats | null> {
    const country = getCatalogEntry(countryCode);

    if (!country) {
      return null;
    }

    const allStickers = getAllStickerRefs(country.code);
    const quantities = await this.repository.getStickerQuantities(ownerId);
    const owned = allStickers.filter((sticker) => (quantities[stickerKey(sticker)] ?? 0) > 0);
    const missing = allStickers.filter((sticker) => (quantities[stickerKey(sticker)] ?? 0) <= 0);

    return {
      countryCode: country.code,
      countryName: country.name,
      total: country.totalStickers,
      owned: sortStickers(owned),
      missing: sortStickers(missing),
      percentage: this.formatPercentage(owned.length, country.totalStickers),
      quantities,
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

  private async getLanguage(ownerId: string): Promise<BotLanguage | undefined> {
    return (await this.repository.getProfile(ownerId))?.language;
  }

  private languageSelectionReply(): BotActionResult {
    return {
      reply: t('en', 'chooseLanguage'),
      replyMarkup: languageKeyboard,
    };
  }

  private async startMenuReply(ownerId: string, language: BotLanguage): Promise<BotActionResult> {
    const activeAlbum = await this.repository.getActiveAlbum(ownerId);
    const userAlbums = await this.repository.listAlbums(ownerId);
    const lines = [
      t(language, 'startMenu'),
      activeAlbum
        ? t(language, 'activeAlbumLine', { albumName: escapeTelegramHtml(activeAlbum.name) })
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
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: albumRows,
      },
    };
  }

  private async albumListReply(ownerId: string, language: BotLanguage): Promise<BotActionResult> {
    const userAlbums = await this.repository.listAlbums(ownerId);
    const activeAlbum = await this.repository.getActiveAlbum(ownerId);
    const lines = [t(language, 'albumsTitle')];

    if (activeAlbum) {
      lines.push(t(language, 'activeAlbumLine', { albumName: escapeTelegramHtml(activeAlbum.name) }));
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
        parseMode: 'HTML',
        replyMarkup: (await this.startMenuReply(ownerId, language)).replyMarkup,
      };
    }

    lines.push('');
    lines.push(...userAlbums.map((album, index) => this.formatAlbumLine(album, index, language)));

    return {
      reply: lines.join('\n'),
      parseMode: 'HTML',
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

  private async createAlbum(ownerId: string, albumName: string, language: BotLanguage): Promise<BotActionResult> {
    const normalizedAlbumName = albumName.trim();

    if (!normalizedAlbumName) {
      return { reply: t(language, 'albumNameRequired') };
    }

    const album = await this.repository.createAlbum(
      ownerId,
      AVAILABLE_ALBUM_TEMPLATES[0].slug,
      normalizedAlbumName,
    );

    if (!album) {
      return { reply: t(language, 'albumCreateFailed') };
    }

    return {
      reply: `${t(language, 'albumCreated', { albumName: escapeTelegramHtml(album.name) })}\n\n${t(language, 'firstAlbumHint')}`,
      parseMode: 'HTML',
    };
  }

  private async selectAlbum(ownerId: string, selector: string, language: BotLanguage): Promise<BotActionResult> {
    const match = await this.findAlbum(ownerId, selector);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const album = await this.repository.setActiveAlbum(ownerId, match.album.id);

    if (!album) {
      return { reply: t(language, 'albumSelectFailed') };
    }

    return {
      reply: t(language, 'albumSelected', { albumName: album.name }),
    };
  }

  private async renameAlbum(
    ownerId: string,
    albumName: string,
    selector: string | undefined,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const normalizedAlbumName = albumName.trim();

    if (!normalizedAlbumName) {
      return { reply: t(language, 'albumNameRequired') };
    }

    const match = selector
      ? await this.findAlbum(ownerId, selector)
      : await this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const result = await this.repository.renameAlbum(ownerId, match.album.id, normalizedAlbumName);

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

  private async deleteAlbum(
    ownerId: string,
    selector: string | undefined,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const match = selector
      ? await this.findAlbum(ownerId, selector)
      : await this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    return {
      reply: t(language, 'albumDeleteConfirm', { albumName: match.album.name }),
      replyMarkup: {
        inline_keyboard: [[
          {
            text: t(language, 'buttonYes'),
            callback_data: `album:delete:${match.album.id}:confirm`,
          },
          {
            text: t(language, 'buttonNo'),
            callback_data: `album:delete:${match.album.id}:cancel`,
          },
        ]],
      },
    };
  }

  private async deleteAlbumConfirmed(
    ownerId: string,
    albumId: string,
    language: BotLanguage,
  ): Promise<BotActionResult> {
    const result = await this.repository.deleteAlbum(ownerId, albumId);

    if (result.error || !result.album) {
      return {
        reply: this.translateAlbumRepositoryError(result.error, language)
          ?? t(language, 'albumDeleteFailed'),
      };
    }

    return {
      reply: t(language, 'albumDeleted', { albumName: result.album.name }),
      replyMarkup: (await this.startMenuReply(ownerId, language)).replyMarkup,
    };
  }

  private async leaveAlbum(ownerId: string, language: BotLanguage): Promise<BotActionResult> {
    const match = await this.findActiveAlbum(ownerId);

    if (match.error) {
      return { reply: this.translateAlbumLookupError(match.error, language) };
    }

    const result = await this.repository.leaveAlbum(ownerId, match.album.id);

    if (result.error || !result.album) {
      return {
        reply: this.translateAlbumRepositoryError(result.error, language)
          ?? t(language, 'albumLeaveFailed'),
      };
    }

    return {
      reply: t(language, 'albumLeft', { albumName: result.album.name }),
      replyMarkup: (await this.startMenuReply(ownerId, language)).replyMarkup,
    };
  }

  private async findActiveAlbum(ownerId: string): Promise<{
    album: CollectionSummary;
    error?: never;
  } | {
    album?: never;
    error: 'not_found';
  }> {
    const album = await this.repository.getActiveAlbum(ownerId);

    return album ? { album } : { error: 'not_found' };
  }

  private async findAlbum(ownerId: string, selector: string): Promise<{
    album: CollectionSummary;
    error?: never;
  } | {
    album?: never;
    error: 'not_found' | 'ambiguous';
  }> {
    const albums = await this.repository.listAlbums(ownerId);
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
    album: CollectionSummary,
    index: number,
    language: BotLanguage,
  ): string {
    const template = getAlbumTemplate(album.albumSlug);
    const templateName = template?.name ?? album.albumSlug;
    const markers = [
      album.isActive ? t(language, 'albumActiveMarker') : undefined,
      album.isShared ? t(language, 'albumSharedMarker') : t(language, 'albumOwnedMarker'),
    ].filter(Boolean) as string[];
    const ownerText = album.isShared && album.ownerDisplayName
      ? ` · ${album.ownerDisplayName}`
      : '';

    return `${index + 1}. <b>${escapeTelegramHtml(album.name)}</b>\n   ${templateName} · ${markers.join(' · ')}${ownerText}`;
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
    if (parsed.intent === 'duplicates' && parsed.targetUsername) {
      return false;
    }

    return [
      'querySticker',
      'queryCountry',
      'addSticker',
      'addStickers',
      'removeSticker',
      'tradeCreate',
      'missing',
      'duplicates',
      'progress',
      'share',
      'compare',
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

    if (/^(Trade|Marketplace)\b/.test(reason)) {
      return reason;
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

  private translateFriendRepositoryError(
    error: string | undefined,
    language: BotLanguage,
  ): string | undefined {
    if (!error) {
      return undefined;
    }

    const unknownUserMatch = /^No conozco a @(.+)\./.exec(error);
    const alreadyFriendMatch = /^Ya eres amigo de @(.+)\./.exec(error);
    const incomingPendingMatch = /^@(.+) ya te envio una solicitud\./.exec(error);
    const notFriendsMatch = /^No eres amigo de @(.+)\./.exec(error);

    if (unknownUserMatch) {
      return t(language, 'compareUnknownUser', { username: unknownUserMatch[1] });
    }

    if (notFriendsMatch) {
      return t(language, 'friendNotFriends', { username: `@${notFriendsMatch[1]}` });
    }

    if (error === 'No puedes agregarte como amigo.') {
      if (language === 'es') return 'No puedes agregarte como amigo.';
      if (language === 'zh') return 'Choose another user to add as a friend.';
      return 'Choose another user to add as a friend.';
    }

    if (alreadyFriendMatch) {
      if (language === 'es') return `Ya eres amigo de @${alreadyFriendMatch[1]}.`;
      if (language === 'zh') return `You are already friends with @${alreadyFriendMatch[1]}.`;
      return `You are already friends with @${alreadyFriendMatch[1]}.`;
    }

    if (incomingPendingMatch) {
      if (language === 'es') {
        return `@${incomingPendingMatch[1]} ya te envio una solicitud. Aceptala desde el mensaje que recibiste.`;
      }

      return `@${incomingPendingMatch[1]} already sent you a friend request. Accept it from the message you received.`;
    }

    if (error === 'Solicitud de amistad no encontrada.') {
      if (language === 'es') return 'Solicitud de amistad no encontrada.';
      return 'Friend request not found.';
    }

    if (error === 'Esta solicitud ya fue respondida.') {
      return t(language, 'shareAlreadyAnswered');
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

  private async recordHistory(
    ownerId: string,
    action: StickerHistoryAction,
    result: {
      sticker: StickerRef;
      previousQuantity: number;
      currentQuantity: number;
      changed: boolean;
    },
  ): Promise<void> {
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

    await this.repository.recordHistory(ownerId, entry);
  }
}

export const stickerBotService = new StickerBotService();
