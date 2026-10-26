export class ChatQueue {
  private messages: string[] = [];
  private sending = false;

  constructor(
    private readonly send: (message: string) => Promise<void>,
    private readonly onError: (error: unknown, message: string) => void,
    private readonly intervalMs = 2000,
  ) {}

  enqueue(message: string) {
    this.messages.push(message);
    void this.drain();
  }

  private async drain() {
    if (this.sending || this.messages.length === 0) return;
    this.sending = true;
    const message = this.messages.shift()!;
    try {
      await this.send(message);
    } catch (error) {
      this.onError(error, message);
    } finally {
      setTimeout(() => {
        this.sending = false;
        void this.drain();
      }, this.intervalMs);
    }
  }
}
