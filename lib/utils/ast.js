export const tokenTag = (type, value = null, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'TokenTag', value: { type, value, attrs } };
};

export const tokenGapTag = (type, value = null, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'TokenGapTag', value: { type, value, attrs } };
};

export const nodeOpenTag = (type, gapType, attrs = new Map()) => {
  if (!type) throw new Error();
  return { type: 'NodeOpenTag', value: { type, gapType, attrs } };
};

export const nodeCloseTag = (type) => {
  return { type: 'NodeCloseTag', value: { type } };
};

export const gapNodeTag = (type, attrs) => {
  return { type: 'NodeGapTag', value: { type, attrs } };
};

export const string = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'String', value: pattern };
};

export const regex = (pattern) => {
  if (!pattern) throw new Error();
  return { type: 'Regex', value: pattern };
};
