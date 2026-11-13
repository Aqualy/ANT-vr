import { createComponent, defineComponents, Types } from '@iwsdk/core';
export const ActionTarget = createComponent('ActionTarget', { id: { type: Types.String, default: '' } });
export const HeldPaper = createComponent('HeldPaper', { id: { type: Types.String, default: '' } });
export default defineComponents([ActionTarget, HeldPaper]);
