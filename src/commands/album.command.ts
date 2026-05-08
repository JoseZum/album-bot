import { BaseCommand } from './base-command';

export type AlbumCommandInput = {
  action?: 'create' | 'update' | 'delete' | 'list';
  payload?: Record<string, unknown>;
};

export type AlbumCommandResult = {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
};

export class AlbumCommand extends BaseCommand<AlbumCommandInput, AlbumCommandResult> {
  protected async validate(input: AlbumCommandInput): Promise<void> {
    if (!input.action) {
      throw new Error('AlbumCommand requires an action');
    }
  }

  protected async handle(input: AlbumCommandInput): Promise<AlbumCommandResult> {
    return {
      success: true,
      message: `AlbumCommand executed with action: ${input.action}`,
      data: input.payload,
    };
  }
}