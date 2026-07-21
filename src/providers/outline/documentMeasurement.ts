import type { OutlineDocumentMeasurement } from './outlineTypes';

const utf8ByteLength = (text: string): number => {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

export const measureOutlineDocument = (
  text: string,
  byteBudget: number,
  documentLineCount: number,
): OutlineDocumentMeasurement => {
  const byteSize = utf8ByteLength(text);
  if (documentLineCount <= 0) return { byteSize, prefixLineCount: 0 };
  if (byteSize <= byteBudget) {
    return { byteSize, prefixLineCount: documentLineCount };
  }
  const proportionalLineCount = Math.floor(
    (documentLineCount * byteBudget) / byteSize,
  );
  return {
    byteSize,
    prefixLineCount: Math.max(
      1,
      Math.min(documentLineCount, proportionalLineCount),
    ),
  };
};
