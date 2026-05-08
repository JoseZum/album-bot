import { Command } from './command';

export abstract class BaseCommand<TInput, TResult> implements Command<TInput, TResult> {
  async execute(input: TInput): Promise<TResult> {
    await this.beforeExecute(input);
    await this.validate(input);

    try {
      const result = await this.handle(input);
      await this.afterExecute(input, result);

      return result;
    } catch (error) {
      await this.onError(input, error);
      throw error;
    }
  }

  protected async beforeExecute(input: TInput): Promise<void> {}

  protected async validate(input: TInput): Promise<void> {}

  protected abstract handle(input: TInput): Promise<TResult>;

  protected async afterExecute(input: TInput, result: TResult): Promise<void> {}

  protected async onError(input: TInput, error: unknown): Promise<void> {}
}