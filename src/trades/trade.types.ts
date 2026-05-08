import {
  formatSticker,
  getAllStickerRefs,
  type StickerRef,
} from '../catalog/world-cup.catalog';

export type TradeSelector =
  | { kind: 'sticker'; sticker: StickerRef }
  | { kind: 'duplicate'; countryCode?: string }
  | { kind: 'missing'; countryCode?: string };

export type TradeOfferStatus =
  | 'active'
  | 'pending_confirmation'
  | 'accepted_pending_completion'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type TradeOffer = {
  id: string;
  ownerId: string;
  collectionId: string;
  give: TradeSelector;
  want: TradeSelector;
  status: TradeOfferStatus;
  createdAt: string;
  reservedByOwnerId?: string;
  reservedCollectionId?: string;
  resolvedGive?: StickerRef;
  resolvedWant?: StickerRef;
  ownerConfirmedAt?: string;
  takerConfirmedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
};

export type TradePair = {
  give: StickerRef;
  want: StickerRef;
};

export type MarketplaceSearch = {
  mineOnly?: boolean;
  ownerUsername?: string;
  sticker?: StickerRef;
};

export const isStickerSelector = (
  selector: TradeSelector,
): selector is Extract<TradeSelector, { kind: 'sticker' }> =>
  selector.kind === 'sticker';

export const formatTradeSelector = (selector: TradeSelector): string => {
  if (selector.kind === 'sticker') {
    return formatSticker(selector.sticker);
  }

  const scope = selector.countryCode ? ` of ${selector.countryCode}` : '';

  return selector.kind === 'duplicate'
    ? `any duplicate${scope}`
    : `any missing${scope}`;
};

export const getTradeSelectorCandidates = (
  selector: TradeSelector,
  explicitSticker?: StickerRef,
): StickerRef[] => {
  if (selector.kind === 'sticker') {
    return [selector.sticker];
  }

  if (selector.countryCode) {
    return getAllStickerRefs(selector.countryCode);
  }

  if (explicitSticker) {
    return [explicitSticker];
  }

  return [];
};

export const tradeSelectorMatchesSticker = (
  selector: TradeSelector,
  sticker: StickerRef,
): boolean => {
  if (selector.kind === 'sticker') {
    return (
      selector.sticker.countryCode === sticker.countryCode
      && selector.sticker.number === sticker.number
    );
  }

  return !selector.countryCode || selector.countryCode === sticker.countryCode;
};
