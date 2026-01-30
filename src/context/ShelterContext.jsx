import React, { createContext, useState, useContext, useEffect } from 'react';
import { get, set, del } from 'idb-keyval';
import { DEFAULT_ZONES, INITIAL_SCALE_RATIO } from '../constants';

const ShelterContext = createContext();

export const ShelterProvider = ({ children }) => {
    // Helper to load data
    const loadData = () => {
        try {
            const saved = localStorage.getItem('shelter-layout-data');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error("Failed to load data", e);
        }
        return null;
    };

    const initialData = loadData();

    // Application State
    const [backgroundImage, setBackgroundImage] = useState(null);
    const [scaleRatio, setScaleRatio] = useState(initialData?.scaleRatio || INITIAL_SCALE_RATIO);
    const [viewScale, setViewScale] = useState(1);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [zones, setZones] = useState(initialData?.zones || []);
    const [zoneTypes, setZoneTypes] = useState(initialData?.zoneTypes || DEFAULT_ZONES);
    const [selectedId, setSelectedId] = useState(null);
    const [isScaleMode, setIsScaleMode] = useState(false);

    // IndexedDB: Load background image
    useEffect(() => {
        get('background-image').then((val) => {
            if (val) setBackgroundImage(val);
        });
    }, []);

    // IndexedDB: Save background image
    useEffect(() => {
        if (backgroundImage) {
            set('background-image', backgroundImage);
        }
    }, [backgroundImage]);

    // Save to LocalStorage whenever relevant state changes
    useEffect(() => {
        const dataToSave = {
            zoneTypes,
            zones,
            scaleRatio
        };
        localStorage.setItem('shelter-layout-data', JSON.stringify(dataToSave));
    }, [zoneTypes, zones, scaleRatio]);

    // Actions
    const addZone = (typeId, x, y) => {
        const type = zoneTypes.find(z => z.id === typeId);
        if (!type) return;

        const newZone = {
            id: `zone-${Date.now()}`,
            typeId: type.id,
            name: type.name,
            x,
            y,
            width: type.width * scaleRatio,
            height: type.height * scaleRatio,
            rotation: 0,
            color: type.color,
            resizable: type.resizable,
        };
        // Add to end (top of stack)
        setZones([...zones, newZone]);
        setSelectedId(newZone.id);
    };

    const addText = () => {
        const newText = {
            id: `text-${Date.now()}`,
            type: 'TEXT',
            text: 'テキストを入力',
            x: 100, // Default position (needs improved logic to center ideally, but fixed for MVP)
            y: 100,
            fontSize: 20,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            color: '#000000',
            resizable: true // Text is always resizable
        };
        setZones([...zones, newText]);
        setSelectedId(newText.id);
    };

    const updateZone = (id, newAttrs) => {
        setZones(zones.map(z => z.id === id ? { ...z, ...newAttrs } : z));
    };

    const removeZone = (id) => {
        if (!id) return;
        setZones(zones.filter(z => z.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const clearAll = () => {
        setZones([]);
        setSelectedId(null);
        setBackgroundImage(null);
        del('background-image');
    };

    const addZoneType = (newType) => {
        setZoneTypes([...zoneTypes, { ...newType, id: `custom-${Date.now()}` }]);
    };

    const value = {
        backgroundImage, setBackgroundImage,
        scaleRatio, setScaleRatio,
        viewScale, setViewScale,
        stagePos, setStagePos,
        zones, setZones,
        zoneTypes, addZoneType,
        selectedId, setSelectedId,
        addZone, addText, updateZone, removeZone, clearAll,
        isScaleMode, setIsScaleMode
    };

    return (
        <ShelterContext.Provider value={value}>
            {children}
        </ShelterContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useShelter = () => useContext(ShelterContext);
