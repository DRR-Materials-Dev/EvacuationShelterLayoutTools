import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Group, Text } from 'react-konva';
import { Paper, Stack, Text as MText } from '@mantine/core';
import type { ZoneType } from '../../shared/types.ts';
import {
  getZoneBorder,
  getZoneDisplayText,
  getZoneNameAlignH,
  getZoneNameAlignV,
  getZoneNameColor,
} from '../../shared/types.ts';
import ZoneImageKonva from '../../shared/components/ZoneImageKonva.tsx';

type Props = {
  zone: ZoneType;
};

const PADDING = 16;
const PREVIEW_CONTAINER_SIZE = 320;

const ZonePreview = ({ zone }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: PREVIEW_CONTAINER_SIZE, height: PREVIEW_CONTAINER_SIZE });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const availW = Math.max(40, containerSize.width - PADDING * 2);
  const availH = Math.max(40, containerSize.height - PADDING * 2);

  // 区画 1m あたりのプレビュー上の px
  const pxPerMeter = Math.min(availW / zone.width, availH / zone.height);
  const zoneWidthPx = zone.width * pxPerMeter;
  const zoneHeightPx = zone.height * pxPerMeter;
  const offsetX = (containerSize.width - zoneWidthPx) / 2;
  const offsetY = (containerSize.height - zoneHeightPx) / 2;

  return (
    <Paper withBorder p="xs" style={{ background: '#fafafa' }}>
      <Stack gap={4}>
        <MText size="xs" c="dimmed">
          プレビュー（{zone.width}m × {zone.height}m）
        </MText>
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: PREVIEW_CONTAINER_SIZE,
            background:
              'repeating-conic-gradient(#f0f0f0 0% 25%, #e0e0e0 0% 50%) 50% / 20px 20px',
            border: '1px dashed #ccc',
            borderRadius: 4,
          }}
        >
          <Stage width={containerSize.width} height={containerSize.height}>
            <Layer>
              <Group
                x={offsetX}
                y={offsetY}
                clipX={0}
                clipY={0}
                clipWidth={zoneWidthPx}
                clipHeight={zoneHeightPx}
              >
                <Rect width={zoneWidthPx} height={zoneHeightPx} fill={zone.color} opacity={0.85} />
                {zone.image && (
                  <ZoneImageKonva
                    image={zone.image}
                    zoneWidthPx={zoneWidthPx}
                    zoneHeightPx={zoneHeightPx}
                  />
                )}
                {(() => {
                  const border = getZoneBorder(zone);
                  if (!border.show || border.widthPx <= 0) return null;
                  return (
                    <Rect
                      width={zoneWidthPx}
                      height={zoneHeightPx}
                      stroke={border.color}
                      strokeWidth={border.widthPx}
                      listening={false}
                    />
                  );
                })()}
                {zone.showName !== false && (
                  <Text
                    text={getZoneDisplayText(zone)}
                    fill={getZoneNameColor(zone)}
                    width={zoneWidthPx}
                    height={zoneHeightPx}
                    align={getZoneNameAlignH(zone)}
                    verticalAlign={getZoneNameAlignV(zone)}
                    fontSize={
                      zone.nameFontSize !== undefined
                        ? Math.max(4, zone.nameFontSize * pxPerMeter)
                        : Math.max(10, Math.min(zoneWidthPx, zoneHeightPx) / 6)
                    }
                    padding={4}
                  />
                )}
              </Group>
            </Layer>
          </Stage>
        </div>
      </Stack>
    </Paper>
  );
};

export default ZonePreview;
