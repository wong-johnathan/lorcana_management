import type { Card, MarketplaceListingPhoto } from "../types";
import { cardArtUrl } from "./cardImages";

/**
 * A single ordered entry in the carousel lightbox: the image URL plus the
 * human-readable caption shown (and used as the accessible label) for it.
 */
export interface ListingImageItem {
  src: string;
  caption: string;
}

/**
 * Whether a card has its own art to show (REQ-LB-3.1). The single "no art"
 * source of truth is `Card.imageUrl` empty, via the existing `cardArtUrl`
 * helper (REQ-POL-12).
 */
export function hasCardArt(card: Card | null | undefined): boolean {
  return card != null && cardArtUrl(card) !== "";
}

/**
 * The card-art caption: name · set name · collector number, joining only
 * non-empty segments with " · " and using `card.cardNumber` verbatim (it may
 * carry a language/finish suffix like "1/204 • EN • 1" — REQ-LB-2.1).
 */
export function cardArtCaption(card: Card | null | undefined): string {
  if (card == null) return "";
  return [card.name, card.setName, card.cardNumber]
    .filter((segment) => segment !== "")
    .join(" · ");
}

/**
 * The condition-photo caption: the position label when set, otherwise the
 * literal "condition photo" (covers both empty string and null — REQ-LB-2.2).
 */
export function photoCaption(photo: { label: string | null }): string {
  return photo.label ? photo.label : "condition photo";
}

/**
 * The listing's full ordered image set: the card-art entry (present only when
 * `hasCardArt(card)` is true) followed by every condition photo in wire order.
 * The server already returns photos `sortOrder`-ascending, so the client must
 * NOT re-sort (REQ-LB-3.1).
 */
export function listingImageItems(
  card: Card | null | undefined,
  photos: readonly MarketplaceListingPhoto[]
): ListingImageItem[] {
  const items: ListingImageItem[] = [];
  if (card != null && hasCardArt(card)) {
    items.push({ src: cardArtUrl(card), caption: cardArtCaption(card) });
  }
  for (const photo of photos) {
    items.push({ src: photo.url, caption: photoCaption(photo) });
  }
  return items;
}

/**
 * The 0-based index of a photo in the ordered set (card art first when
 * present). Called only with a photo that is a member of `photos`; a misuse
 * (photo not in the array) degrades to a negative/incorrect index that the
 * carousel clamps to 0.
 */
export function photoStartIndex(
  card: Card | null | undefined,
  photos: readonly MarketplaceListingPhoto[],
  photo: MarketplaceListingPhoto
): number {
  return (hasCardArt(card) ? 1 : 0) + photos.indexOf(photo);
}
