export interface Command<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
}