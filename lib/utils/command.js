export const hasDescriptor = (command) => {
  const { type } = command;
  return type === 'eat' || type === 'eatMatch' || type === 'match';
};

export const formatDescriptor = (descriptor) => {
  return `${descriptor.type}\`${descriptor.value}\``;
};

export const formatCommand = (command) => {
  let formatted = '';
  const type =
    typeof command.type === 'symbol'
      ? command.type.description.replace('@cst-tokens/command/', '')
      : typeof command.type === 'string'
      ? `'${command.type}'`
      : command.type;
  formatted += `type: ${type || 'unknown command'}`;
  if (hasDescriptor(command)) formatted += `, value: ${formatDescriptor(command.value)}`;
  return `{${formatted}}`;
};
