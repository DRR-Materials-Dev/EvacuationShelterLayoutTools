import React, { useState } from 'react';
import { useShelter } from '../context/ShelterContext';

const Sidebar = () => {
    const { zoneTypes, addZoneType } = useShelter();
    // State for new custom zone form
    const [newZone, setNewZone] = useState({ name: '', width: 1, height: 1, color: '#dddddd' });

    const handleDragStart = (e, typeId) => {
        e.dataTransfer.setData('typeId', typeId);
    };

    const handleCreateType = (e) => {
        e.preventDefault();
        if (newZone.name) {
            addZoneType(newZone);
            setNewZone({ name: '', width: 1, height: 1, color: '#dddddd' });
        }
    };

    return (
        <div className="sidebar">
            <h3>区画一覧</h3>
            <p className="hint">ドラッグして配置</p>
            <div className="zone-list">
                {zoneTypes.map((type) => (
                    <div
                        key={type.id}
                        className="zone-item"
                        draggable
                        onDragStart={(e) => handleDragStart(e, type.id)}
                        style={{ borderLeft: `5px solid ${type.color}` }}
                    >
                        <span className="zone-name">{type.name}</span>
                        <span className="zone-dims">{type.width}m x {type.height}m</span>
                    </div>
                ))}
            </div>

            <div className="create-zone">
                <h4>新規区画作成</h4>
                <form onSubmit={handleCreateType}>
                    <div className="form-group">
                        <label>名前</label>
                        <input
                            value={newZone.name}
                            onChange={e => setNewZone({ ...newZone, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group half">
                            <label>幅(m)</label>
                            <input
                                type="number" step="0.1"
                                value={newZone.width}
                                onChange={e => setNewZone({ ...newZone, width: parseFloat(e.target.value) })}
                                required
                            />
                        </div>
                        <div className="form-group half">
                            <label>高さ(m)</label>
                            <input
                                type="number" step="0.1"
                                value={newZone.height}
                                onChange={e => setNewZone({ ...newZone, height: parseFloat(e.target.value) })}
                                required
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>色</label>
                        <input
                            type="color"
                            value={newZone.color}
                            onChange={e => setNewZone({ ...newZone, color: e.target.value })}
                        />
                    </div>
                    <button type="submit">区画タイプ追加</button>
                </form>
            </div>
        </div>
    );
};

export default Sidebar;
