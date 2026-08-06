/**
 * jsdom implements no layout, so anything that measures the document throws
 * rather than returning zeroes. Plate's floating toolbar measures the selection
 * rect whenever a non-collapsed selection exists, which any test that selects
 * text will hit. Stubbing this keeps those failures from surfacing as unhandled
 * rejections that have nothing to do with what is under test.
 */
const emptyRect = (): DOMRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  toJSON: () => ({}),
  top: 0,
  width: 0,
  x: 0,
  y: 0,
});

if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = emptyRect;
  Range.prototype.getClientRects = () =>
    ({ item: () => null, length: 0, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}
