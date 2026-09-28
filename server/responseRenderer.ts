import type { SavedResponse } from '../src/domain/response';
import { renderPrintableHtml } from './printRenderer';
import { renderSemiCarePlanHtml } from './semiPrintRenderer';

export function renderResponseHtml(response: SavedResponse): string {
  if (response.kind === 'full-custom')
    return renderPrintableHtml(response.templateSnapshot, response.formData);
  return renderSemiCarePlanHtml(response.templateSnapshot, response.formData);
}
