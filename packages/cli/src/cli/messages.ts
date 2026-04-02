import boxen from 'boxen';

export const showMessage = (
  titleMessage = '',
  contentMessage = '',
  type: 'standard' | 'error' | 'warning' = 'standard',
): string => {
  let color = 'cyan';
  if (type === 'error') {
    color = 'redBright';
  } else if (type === 'warning') {
    color = 'yellow';
  }

  const message = boxen(contentMessage, {
    title: titleMessage,
    padding: 1,
    margin: 1,
    borderStyle: 'single',
    borderColor: color,
    textAlignment: 'left',
    titleAlignment: 'center',
  });

  console.log(message);
  return message;
};
