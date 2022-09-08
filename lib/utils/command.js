const hasDescriptor = (command) => {
  return command.type === 'take';
};

const formatDescriptor = (descriptor) => {
  return `${descriptor.type}\`${descriptor.value}\``;
};

const formatCommand = (command) => {
  let formatted = '';
  formatted += `type: '${command.type || 'unknown command'}'`;
  if (hasDescriptor(command)) formatted += `, value: ${formatDescriptor(command.value)}`;
  return `{${formatted}}`;
};

module.exports = { hasDescriptor, formatDescriptor, formatCommand };
