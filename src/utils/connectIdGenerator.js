export const generateConnectId = () => {
  let id = '';
  while (id.length < 10) {
    id += Math.floor(Math.random() * 10).toString();
  }
  if (id[0] === '0') {
    id = `1${id.slice(1)}`;
  }
  return id;
};

