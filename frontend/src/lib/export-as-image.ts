function copyComputedStyles(source: Element, target: Element) {
  const sourceStyle = window.getComputedStyle(source);
  const targetElement = target as HTMLElement;

  targetElement.style.cssText = Array.from(sourceStyle).reduce((styles, property) => {
    return `${styles}${property}:${sourceStyle.getPropertyValue(property)};`;
  }, "");

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);

  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index];
    if (targetChild) {
      copyComputedStyles(child, targetChild);
    }
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load exported image"));
    image.src = src;
  });
}

export async function exportNodeAsPng(node: HTMLElement, filename: string) {
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const pixelRatio = window.devicePixelRatio || 1;

  const clonedNode = node.cloneNode(true) as HTMLElement;
  clonedNode.style.margin = "0";
  clonedNode.style.width = `${width}px`;
  clonedNode.style.height = `${height}px`;
  copyComputedStyles(node, clonedNode);

  const serializedNode = new XMLSerializer().serializeToString(clonedNode);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">${serializedNode}</foreignObject>
    </svg>
  `;

  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(height * pixelRatio));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable");
  }

  context.scale(pixelRatio, pixelRatio);
  context.drawImage(image, 0, 0, width, height);

  const downloadLink = document.createElement("a");
  downloadLink.download = filename;
  downloadLink.href = canvas.toDataURL("image/png");
  downloadLink.click();
}
