export const tokenTag = (tagType, value = null, attrs = []) => {
  if (!tagType) throw new Error();
  return { type: 'TokenTag', tagType, value, attrs };
};

export const tokenGapTag = (tagType, value = null, attrs = []) => {
  if (!tagType) throw new Error();
  return { type: 'TokenGapTag', tagType, value, attrs };
};

export const nodeOpenTag = (tagType, gapType, attrs = []) => {
  if (!tagType) throw new Error();
  return { type: 'NodeOpenTag', tagType, gapType, attrs };
};

export const nodeCloseTag = (tagType) => {
  return { type: 'NodeCloseTag', tagType };
};

export const gapNodeTag = (tagType, attrs) => {
  return { type: 'NodeGapTag', tagType, attrs };
};
