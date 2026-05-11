import { useRef } from 'react';
import { Button, FileButton, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconUpload, IconTrash } from '@tabler/icons-react';
import type { ImageFitMode, ZoneImage } from '../../shared/types.ts';

type Props = {
  image: ZoneImage | undefined;
  onChange: (image: ZoneImage | undefined) => void;
};

const FIT_MODE_OPTIONS: { value: ImageFitMode; label: string }[] = [
  { value: 'fill', label: '区画サイズに合わせる' },
  { value: 'contain', label: '縦横比維持: 長辺フィット' },
  { value: 'manual', label: '縮尺設定（縦・横を指定）' },
];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('読み込み失敗'));
    r.readAsDataURL(file);
  });

const ImageControls = ({ image, onChange }: Props) => {
  // FileButton 用の reset 参照（ファイル選択をやり直したい場合用）
  const resetRef = useRef<() => void>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({
        dataUrl,
        fitMode: image?.fitMode ?? 'contain',
        rotation: image?.rotation ?? 0,
        scaleX: image?.scaleX ?? 1,
        scaleY: image?.scaleY ?? 1,
      });
    } catch {
      // 無視（ユーザーに通知したい場合はトーストを追加）
    } finally {
      resetRef.current?.();
    }
  };

  const updateImage = (patch: Partial<ZoneImage>) => {
    if (!image) return;
    onChange({ ...image, ...patch });
  };

  return (
    <Stack gap="xs">
      <Group gap="xs" align="center" wrap="wrap">
        <FileButton resetRef={resetRef} accept="image/*" onChange={(f) => void handleFile(f)}>
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconUpload size={16} />}>
              {image ? '画像を変更' : '画像を選択'}
            </Button>
          )}
        </FileButton>
        {image && (
          <Button
            variant="default"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => onChange(undefined)}
          >
            画像を削除
          </Button>
        )}
        <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 220 }}>
          推奨: 最大 512×512 px・200 KB 以下。画像は区画リストファイルに埋め込まれるため、
          できるだけ小さい画像を使用してください。
        </Text>
      </Group>

      {image ? (
        <>
          <Select
            label="画像の表示モード"
            value={image.fitMode}
            onChange={(v) => v && updateImage({ fitMode: v as ImageFitMode })}
            data={FIT_MODE_OPTIONS}
            allowDeselect={false}
          />

          {image.fitMode === 'manual' && (
            <Group grow>
              <NumberInput
                label="横方向の縮尺"
                description="1.0 = 区画の幅と同じ"
                value={image.scaleX ?? 1}
                onChange={(v) => updateImage({ scaleX: typeof v === 'number' ? v : 1 })}
                min={0.01}
                step={0.1}
                decimalScale={3}
              />
              <NumberInput
                label="縦方向の縮尺"
                description="1.0 = 区画の高さと同じ"
                value={image.scaleY ?? 1}
                onChange={(v) => updateImage({ scaleY: typeof v === 'number' ? v : 1 })}
                min={0.01}
                step={0.1}
                decimalScale={3}
              />
            </Group>
          )}

          <NumberInput
            label="画像の回転（度）"
            description="-180 〜 180、1° 刻み。区画自体の回転とは独立した画像の事前補正です。"
            value={image.rotation}
            onChange={(v) => updateImage({ rotation: typeof v === 'number' ? clampRotation(v) : 0 })}
            min={-180}
            max={180}
            step={1}
            clampBehavior="strict"
          />
        </>
      ) : (
        <Text size="xs" c="dimmed">
          画像が未設定です。任意で区画に表示する画像を選択できます。
        </Text>
      )}
    </Stack>
  );
};

const clampRotation = (v: number): number => Math.max(-180, Math.min(180, Math.round(v)));

export default ImageControls;
