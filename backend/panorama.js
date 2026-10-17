// Helpers for placing stops on panorama photos automatically.

// Width and height of a JPEG or PNG, read from its header (no image library needed).
export function imageSize(buffer) {
  // PNG: fixed position in the IHDR chunk
  if (buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // JPEG: walk the segments until a "start of frame" marker, which holds the size
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer[offset + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return null;
}

// The reverse of how the viewer wraps a photo around the camera (PanoramaRoom in Viewer.jsx):
// a point in the photo (x, y from 0 to 1) → the direction you look to see it.
// The photo goes all the way around (x), and covers a band of 360° × height/width vertically (y).
export function photoPointToDirection(x, y, { width, height }) {
  const verticalAngle = Math.min(Math.PI, (2 * Math.PI * height) / width);
  const theta = (Math.PI - verticalAngle) / 2 + y * verticalAngle; // 0 = straight up
  const phi = 2 * Math.PI * x;
  return [Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

// Angle in radians between two unit directions.
export const angleBetween = (a, b) =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
