export class Album {
  private stickers: string[] = [];

  add(sticker: string): void {
    this.stickers.push(sticker);
    console.log(`Added ${sticker}`);
  }

  remove(sticker: string): void {
    this.stickers = this.stickers.filter((currentSticker) => currentSticker !== sticker);
    console.log(`Removed ${sticker}`);
  }

  list(): void {
    console.log(this.stickers);
  }
}