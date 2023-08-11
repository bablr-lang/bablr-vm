export const tokenTag = (type, value = null, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'TokenTag', value: { type, value, attrs } };
};

export const gapTokenTag = (type, value = null, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'GapTokenTag', value: { type, value, attrs } };
};

export const openNodeTag = (type, gapType, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'OpenNodeTag', value: { type, gapType, attrs } };
};

export const closeNodeTag = (type) => {
  return { type: 'CloseNodeTag', value: { type } };
};

export const gapNodeTag = (type, attrs) => {
  return { type: 'GapNodeTag', value: { type, attrs } };
};

export const stringPattern = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'StringPattern', value: pattern };
};

export const regexPattern = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'RegexPattern', value: pattern };
};
