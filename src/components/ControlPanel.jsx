import React, { useRef } from 'react';
import { useShelter } from '../context/ShelterContext';

const ControlPanel = ({ onDownload }) => {
    const {
        setBackgroundImage,
        clearAll,
        setIsScaleMode,
        isScaleMode,
        scaleRatio,
        viewScale,
        setViewScale,
        addText,
        removeZone,
        selectedId
    } = useShelter();

    const fileInputRef = useRef(null);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                setBackgroundImage({
                    url,
                    width: img.width,
                    height: img.height,
                });
            };
            img.src = url;
        }
    };

    return (
        <div className="control-panel">
            <div className="control-group">
                <button onClick={() => fileInputRef.current.click()}>施設画像読み込み</button>
                <input
                    type="file"
                    accept="image/*"
                    hidden
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                />

                <button
                    onClick={() => setIsScaleMode(!isScaleMode)}
                    className={isScaleMode ? 'active' : ''}
                >
                    {isScaleMode ? '縮尺設定中(2点クリック)' : '縮尺設定'}
                </button>

                <span className="status-info">
                    現在の縮尺: {scaleRatio.toFixed(2)} px/m
                </span>
                <span className="status-info">
                    表示倍率: {(viewScale * 100).toFixed(0)}%
                </span>
                <button onClick={() => setViewScale(s => Math.min(s * 1.2, 5))}>＋</button>
                <button onClick={() => setViewScale(s => Math.max(s / 1.2, 0.1))}>ー</button>
            </div>

            <div className="control-group">
                <button onClick={addText}>テキスト追加</button>
                <button
                    disabled={!selectedId}
                    onClick={() => removeZone(selectedId)}
                >
                    選択削除
                </button>
                <button className="danger" onClick={() => {
                    if (confirm('配置を全て削除しますか？')) clearAll();
                }}>全削除</button>
                <button className="primary" onClick={onDownload}>画像保存</button>
            </div>
        </div>
    );
};

export default ControlPanel;
