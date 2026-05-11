import { Group, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import type { ZoneImage } from '../types.ts';
import { computeImageDisplaySize } from '../imageFit.ts';

type Props = {
  image: ZoneImage;
  zoneWidthPx: number;
  zoneHeightPx: number;
};

/**
 * 区画タイプの画像を Konva の Image ノードとして描画する共通コンポーネント。
 * 区画の中心を基点に回転し、fitMode に従ってサイズを決める。
 */
const ZoneImageKonva = ({ image, zoneWidthPx, zoneHeightPx }: Props) => {
  const [img] = useImage(image.dataUrl);
  if (!img) return null;

  const { width, height } = computeImageDisplaySize(
    image.fitMode,
    img.naturalWidth,
    img.naturalHeight,
    zoneWidthPx,
    zoneHeightPx,
    image.scaleX ?? 1,
    image.scaleY ?? 1,
  );
  if (width <= 0 || height <= 0) return null;

  return (
    <Group x={zoneWidthPx / 2} y={zoneHeightPx / 2} rotation={image.rotation} listening={false}>
      <KonvaImage
        image={img}
        offsetX={width / 2}
        offsetY={height / 2}
        width={width}
        height={height}
      />
    </Group>
  );
};

export default ZoneImageKonva;
