// Zugriff der App auf die Inhalte. generated/content.json entsteht aus content/ (npm run content)
// und ist dort bereits gegen das Schema geprüft; deshalb genügt hier die Typzuweisung.
import raw from '../../generated/content.json';
import type { Content } from '../../shared/content-schema.ts';

export const content = raw as unknown as Content;
