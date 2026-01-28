/**
 * List indent configuration
 *
 * 役割: listItem の最大深さを定義する
 * 不変条件: ブロックの階層制限と同じ上限を使う
 */

import { INDENT_LEVEL_MAX } from './indentConfig.js';

export const LIST_MAX_DEPTH = INDENT_LEVEL_MAX;
