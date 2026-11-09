import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Slider,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCrop, IconRotate2, IconRotateClockwise2 } from '@tabler/icons-react';
import {
  composeOutput,
  openPdf,
  renderPdfPage,
  rotatedSize,
  type CropRect,
  type PdfDoc,
} from './pdfRender.ts';

type Props = {
  file: File;
  /** 取り込み先の階層名（表示用）。 */
  floorName: string;
  onCancel: () => void;
  onImport: (bg: { dataUrl: string; width: number; height: number }) => void;
};

const PREVIEW_MAX_W = 820;
const PREVIEW_MAX_H = 520;

const RESOLUTIONS = [
  { value: '2000', label: '標準（長辺 2000px）' },
  { value: '3000', label: '高精細（長辺 3000px）' },
  { value: '4000', label: '最高精細（長辺 4000px）' },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * PDF 図面の取り込みモーダル（v2.7.0）。
 * ページを 1 枚選び、回転・トリミングしてから現在の階層の背景画像として読み込む。
 * 別の階層に別ページを使う場合は、その階層に切り替えて改めて読み込む（1 回 = 1 階層 = 1 ページ）。
 */
const PdfImportModal = ({ file, floorName, onCancel, onImport }: Props) => {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [longSide, setLongSide] = useState('3000');
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  /** 描画が完了したページ・解像度のキー（現在のキーと異なる間は読込中）。 */
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rot90, setRot90] = useState(0); // 0 / 90 / 180 / 270
  const [fine, setFine] = useState(0); // -45 〜 45（微調整）
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [draft, setDraft] = useState<CropRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const deg = rot90 + fine;
  const loading = !openFailed && (doc === null || renderedKey !== `${page}:${longSide}`);

  /* ---------- PDF を開く ---------- */
  useEffect(() => {
    let cancelled = false;
    let opened: PdfDoc | null = null;
    openPdf(file)
      .then((d) => {
        opened = d;
        if (cancelled) {
          void d.destroy();
          return;
        }
        setDoc(d);
      })
      .catch(() => {
        if (!cancelled) {
          setError('PDF を開けませんでした（破損しているか、パスワード保護されている可能性があります）');
          setOpenFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (opened) void opened.destroy();
    };
  }, [file]);

  /* ---------- ページ描画（ページ・解像度の変更時） ---------- */
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const key = `${page}:${longSide}`;
    renderPdfPage(doc, page, Number(longSide))
      .then((c) => {
        if (cancelled) return;
        setSrc(c);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(`${page} ページ目の描画に失敗しました`);
      })
      .finally(() => {
        if (!cancelled) setRenderedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, page, longSide]);

  /* ---------- プレビュー寸法 ---------- */
  const geom = useMemo(() => {
    if (!src) return null;
    const rs = rotatedSize(src.width, src.height, deg);
    const s = Math.min(PREVIEW_MAX_W / rs.width, PREVIEW_MAX_H / rs.height, 1);
    return { rw: rs.width, rh: rs.height, s, pw: Math.round(rs.width * s), ph: Math.round(rs.height * s) };
  }, [src, deg]);

  /* ---------- プレビュー描画 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src || !geom) return;
    canvas.width = geom.pw;
    canvas.height = geom.ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, geom.pw, geom.ph);
    ctx.translate(geom.pw / 2, geom.ph / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(
      src,
      (-src.width * geom.s) / 2,
      (-src.height * geom.s) / 2,
      src.width * geom.s,
      src.height * geom.s,
    );
    ctx.restore();
    const r = draft ?? crop;
    if (r) {
      const x = r.x * geom.pw;
      const y = r.y * geom.ph;
      const w = r.w * geom.pw;
      const h = r.h * geom.ph;
      // 切り抜き範囲外を暗くする
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, geom.pw, y);
      ctx.fillRect(0, y + h, geom.pw, geom.ph - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, geom.pw - x - w, h);
      ctx.strokeStyle = '#1e88e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    }
  }, [src, geom, deg, crop, draft]);

  /* ---------- トリミング（ドラッグで範囲指定） ---------- */
  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): CropRect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = toNorm(e);
    setDraft(null);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart.current) return;
    setDraft(rectFrom(dragStart.current, toNorm(e)));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart.current) return;
    const r = rectFrom(dragStart.current, toNorm(e));
    dragStart.current = null;
    setDraft(null);
    // ごく小さい範囲（クリックのみ）は無視して既存のトリミングを維持
    if (geom && r.w * geom.pw >= 8 && r.h * geom.ph >= 8) setCrop(r);
  };

  /* ---------- 回転（トリミング範囲は回転後の座標なので回転時に解除） ---------- */
  const rotateBy = (d: 90 | -90) => {
    setRot90((r) => (r + d + 360) % 360);
    setCrop(null);
  };

  const outputSize = useMemo(() => {
    if (!geom) return null;
    const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    return { w: Math.max(1, Math.round(c.w * geom.rw)), h: Math.max(1, Math.round(c.h * geom.rh)) };
  }, [geom, crop]);

  const handleImport = useCallback(() => {
    if (!src) return;
    try {
      const out = composeOutput(src, deg, crop);
      onImport({ dataUrl: out.toDataURL('image/png'), width: out.width, height: out.height });
    } catch {
      setError('画像の生成に失敗しました（解像度を下げて再度お試しください）');
    }
  }, [src, deg, crop, onImport]);

  const numPages = doc?.numPages ?? 0;

  return (
    <Modal
      opened
      onClose={onCancel}
      title={`PDF から図面を読み込む（${floorName} に読み込み）`}
      size={PREVIEW_MAX_W + 80}
      centered
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          ファイル: {file.name}
          {numPages > 0 && ` ／ 全 ${numPages} ページ`}
          。読み込むのは 1 ページのみです。別のページを他の階層に使う場合は、その階層を選んでから改めて読み込んでください。
        </Text>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {numPages > 1 && (
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
              ページ
            </Text>
            <Pagination
              total={numPages}
              value={page}
              onChange={(p) => {
                setPage(p);
                setCrop(null);
              }}
              size="sm"
              siblings={2}
            />
          </Group>
        )}

        <Group gap="md" wrap="wrap" align="flex-end">
          <Select
            label="解像度"
            data={RESOLUTIONS}
            value={longSide}
            onChange={(v) => v && setLongSide(v)}
            allowDeselect={false}
            w={200}
            comboboxProps={{ withinPortal: true }}
          />
          <Group gap={4}>
            <Tooltip label="左に 90° 回転">
              <Button variant="default" leftSection={<IconRotate2 size={16} />} onClick={() => rotateBy(-90)}>
                左 90°
              </Button>
            </Tooltip>
            <Tooltip label="右に 90° 回転">
              <Button
                variant="default"
                leftSection={<IconRotateClockwise2 size={16} />}
                onClick={() => rotateBy(90)}
              >
                右 90°
              </Button>
            </Tooltip>
          </Group>
          <Stack gap={2} style={{ flex: 1, minWidth: 200 }}>
            <Text size="sm">
              傾き補正: {fine > 0 ? '+' : ''}
              {fine}°（合計 {((deg % 360) + 360) % 360}°）
            </Text>
            <Slider
              value={fine}
              onChange={(v) => {
                setFine(v);
                setCrop(null);
              }}
              min={-45}
              max={45}
              step={0.5}
              label={(v) => `${v}°`}
              marks={[{ value: 0 }]}
            />
          </Stack>
          <Button
            variant="subtle"
            color="gray"
            onClick={() => {
              setRot90(0);
              setFine(0);
              setCrop(null);
            }}
          >
            回転を戻す
          </Button>
        </Group>

        <Group gap="xs" justify="space-between">
          <Text size="xs" c="dimmed">
            <IconCrop size={12} style={{ verticalAlign: 'middle' }} /> プレビュー上をドラッグすると、その範囲だけを切り抜きます（トリミング）。
          </Text>
          <Button size="compact-xs" variant="default" onClick={() => setCrop(null)} disabled={!crop}>
            トリミング解除
          </Button>
        </Group>

        <div
          style={{
            position: 'relative',
            minHeight: 200,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#eceff1',
            borderRadius: 4,
            padding: 8,
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: src ? 'block' : 'none',
              cursor: 'crosshair',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragStart.current = null;
              setDraft(null);
            }}
          />
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.6)',
              }}
            >
              <Loader />
            </div>
          )}
        </div>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {outputSize && `読み込み後の画像サイズ: ${outputSize.w} × ${outputSize.h} px`}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onCancel}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={!src || loading}>
              この階層の図面として読み込む
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default PdfImportModal;
