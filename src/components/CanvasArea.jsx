import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Transformer, Group, Circle, Line } from 'react-konva';
import useImage from 'use-image';
import { useShelter } from '../context/ShelterContext';

// Helper component to load image
const URLImage = ({ image }) => {
    const [img] = useImage(image.url);
    return (
        <KonvaImage
            image={img}
            x={0}
            y={0}
            width={image.width}
            height={image.height}
        />
    );
};

const CanvasArea = ({ stageRef }) => {
    const {
        backgroundImage,
        zones,
        selectedId, setSelectedId,
        updateZone,
        addZone,
        isScaleMode, setIsScaleMode,
        setScaleRatio,
        viewScale, setViewScale,
        stagePos, setStagePos,
        removeZone
    } = useShelter();

    const [scalePoints, setScalePoints] = useState([]); // [ {x, y}, {x, y} ]

    // Keyboard handling for deletion
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                removeZone(selectedId);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, removeZone]);

    // Handle outside click to deselect
    const checkDeselect = (e) => {
        // clicked on stage - clear selection
        const clickedOnEmpty = e.target === e.target.getStage();
        // OR clicked on background image
        const clickedOnBg = e.target.getParent()?.name() === 'background-layer';

        if (clickedOnEmpty || clickedOnBg) {
            setSelectedId(null);
        }
    };

    // Handle Drop
    const handleDrop = (e) => {
        e.preventDefault();
        stageRef.current.setPointersPositions(e);

        // Convert to relative coordinates inside the stage (considering zoom/pan implies stage transform, 
        // but simplified here: we assume stage x/y are 0 for now or handled. 
        // If users zoom/pan the stage, we need to transform pointer pos. 
        // For MVP, if we don't implement stage zoom/pan yet, this is simple.
        // If we do, we need stage.getRelativePointerPosition().

        // Assuming simple stage for now as per minimal requirements, but better to be safe:
        const stage = stageRef.current;

        // If stage is scalable/draggable (Zoom/Pan), we need inverted transform or relative pos
        // But standard drop gives clientX/Y.
        // Let's use `stage.getRelativePointerPosition()` which handles stage transforms!
        const pos = stage.getRelativePointerPosition();

        const typeId = e.dataTransfer.getData('typeId');
        if (typeId) {
            addZone(typeId, pos.x, pos.y);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    // Handle Scale Calibration Clicks
    const handleStageClick = (e) => {
        if (!isScaleMode) {
            checkDeselect(e);
            return;
        }

        const stage = stageRef.current;
        // relative pointer pos is already transformed by stage scale, so it works for logic
        const pos = stage.getRelativePointerPosition();

        const newPoints = [...scalePoints, pos];
        setScalePoints(newPoints);

        if (newPoints.length === 2) {
            // Calculate distance in pixels
            const p1 = newPoints[0];
            const p2 = newPoints[1];
            const distPx = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

            // Prompt user
            setTimeout(() => {
                const distM = prompt('2点間の実際の距離(メートル)を入力してください:', '2');
                if (distM && !isNaN(distM) && parseFloat(distM) > 0) {
                    const ratio = distPx / parseFloat(distM);
                    setScaleRatio(ratio);
                    alert(`縮尺を設定しました: 1m = ${ratio.toFixed(1)}px`);
                }
                // Reset mode
                setIsScaleMode(false);
                setScalePoints([]);
            }, 100);
        }
    };

    const handleWheel = (e) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        const scaleBy = 1.1;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Limit scale
        if (newScale < 0.1 || newScale > 10) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };

        setViewScale(newScale);
        setStagePos(newPos);
    };

    return (
        <div
            className="canvas-container"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <Stage
                width={window.innerWidth - 250} // Adjust for sidebar
                height={window.innerHeight - 80} // Adjust for header
                ref={stageRef}
                onClick={handleStageClick}
                onTap={handleStageClick}

                scaleX={viewScale}
                scaleY={viewScale}
                x={stagePos.x}
                y={stagePos.y}

                onWheel={handleWheel}
                draggable={!isScaleMode}
                onDragEnd={(e) => {
                    // Update stage position in state when dragged
                    if (e.target === stageRef.current) {
                        setStagePos({ x: e.target.x(), y: e.target.y() });
                    }
                }}
            // Let's allow panning the stage to see large maps
            >
                <Layer name="background-layer">
                    {backgroundImage && <URLImage image={backgroundImage} />}

                    {/* Visual feedback for scale points */}
                    {scalePoints.map((p, i) => (
                        <Circle key={i} x={p.x} y={p.y} radius={5} fill="red" />
                    ))}
                    {scalePoints.length === 2 && (
                        <Line
                            points={[scalePoints[0].x, scalePoints[0].y, scalePoints[1].x, scalePoints[1].y]}
                            stroke="red"
                            strokeWidth={2}
                        />
                    )}

                </Layer>

                <Layer>
                    {zones.map((zone) => {
                        if (zone.type === 'TEXT') {
                            return (
                                <TextItem
                                    key={zone.id}
                                    shapeProps={zone}
                                    isSelected={zone.id === selectedId}
                                    onSelect={() => {
                                        if (!isScaleMode) setSelectedId(zone.id);
                                    }}
                                    onChange={(newAttrs) => {
                                        updateZone(zone.id, newAttrs);
                                    }}
                                />
                            );
                        }
                        return (
                            <ZoneItem
                                key={zone.id}
                                shapeProps={zone}
                                isSelected={zone.id === selectedId}
                                onSelect={() => {
                                    if (!isScaleMode) setSelectedId(zone.id);
                                }}
                                onChange={(newAttrs) => {
                                    updateZone(zone.id, newAttrs);
                                }}
                            />
                        );
                    })}
                </Layer>
            </Stage>
        </div>
    );
};

// Sub-component for individual zones
const ZoneItem = ({ shapeProps, isSelected, onSelect, onChange }) => {
    const shapeRef = useRef();
    const trRef = useRef();

    useEffect(() => {
        if (isSelected && trRef.current) {
            // attach transformer
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        }
    }, [isSelected]);

    return (
        <React.Fragment>
            <Group
                draggable
                x={shapeProps.x}
                y={shapeProps.y}
                rotation={shapeProps.rotation}
                width={shapeProps.width}
                height={shapeProps.height}
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={(e) => {
                    onChange({
                        ...shapeProps,
                        x: e.target.x(),
                        y: e.target.y(),
                    });
                }}
                onTransformEnd={() => {
                    // transformer changes scale and rotation
                    const node = shapeRef.current;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    // Reset scale to 1 and adjust width/height
                    node.scaleX(1);
                    node.scaleY(1);

                    onChange({
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        // set minimal value
                        width: Math.max(5, node.width() * scaleX),
                        height: Math.max(5, node.height() * scaleY),
                        rotation: node.rotation()
                    });
                }}
                ref={shapeRef}
            >
                <Rect
                    width={shapeProps.width}
                    height={shapeProps.height}
                    fill={shapeProps.color}
                    opacity={0.8}
                    stroke={isSelected ? 'blue' : 'black'}
                    strokeWidth={1}
                    shadowBlur={5}
                />
                <Text
                    text={shapeProps.name}
                    fontSize={Math.min(shapeProps.width, shapeProps.height) / 3}
                    width={shapeProps.width}
                    align="center"
                    padding={5}
                />
            </Group>
            {isSelected && (
                <Transformer
                    ref={trRef}
                    resizeEnabled={shapeProps.resizable !== false}
                    rotateEnabled={true}
                    boundBoxFunc={(oldBox, newBox) => {
                        // limit resize
                        if (newBox.width < 5 || newBox.height < 5) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
        </React.Fragment>
    );
};

export default CanvasArea;

const TextItem = ({ shapeProps, isSelected, onSelect, onChange }) => {
    const shapeRef = useRef();
    const trRef = useRef();

    useEffect(() => {
        if (isSelected && trRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer().batchDraw();
        }
    }, [isSelected]);

    const handleDblClick = () => {
        const newText = prompt('テキストを入力してください:', shapeProps.text);
        if (newText !== null) {
            onChange({
                ...shapeProps,
                text: newText
            });
        }
    };

    return (
        <React.Fragment>
            <Text
                draggable
                x={shapeProps.x}
                y={shapeProps.y}
                text={shapeProps.text}
                fontSize={shapeProps.fontSize}
                scaleX={shapeProps.scaleX}
                scaleY={shapeProps.scaleY}
                rotation={shapeProps.rotation}
                fill={shapeProps.color}
                onClick={onSelect}
                onTap={onSelect}
                onDblClick={handleDblClick}
                onDragEnd={(e) => {
                    onChange({
                        ...shapeProps,
                        x: e.target.x(),
                        y: e.target.y(),
                    });
                }}
                onTransformEnd={() => {
                    const node = shapeRef.current;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    // reset scale
                    // node.scaleX(1);
                    // node.scaleY(1);
                    // For text, we might want to keep scale or update fontSize.
                    // Keeping scale is easier for now to support arbitrary resizing visual.

                    onChange({
                        ...shapeProps,
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                        scaleX: scaleX,
                        scaleY: scaleY
                    });
                }}
                ref={shapeRef}
            />
            {isSelected && (
                <Transformer
                    ref={trRef}
                    resizeEnabled={true}
                    rotateEnabled={true}
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                />
            )}
        </React.Fragment>
    );
};
