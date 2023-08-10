export const tokenTag = (type, value = null, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'TokenTag', value: { type, value, attrs } };
};

export const openTag = (type, gapType, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'OpenTag', value: { type, gapType, attrs } };
};

export const closeTag = (type) => {
  return { type: 'CloseTag', value: { type } };
};

export const stringPattern = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'StringPattern', value: pattern };
};

export const regexPattern = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'RegexPattern', value: pattern };
};
