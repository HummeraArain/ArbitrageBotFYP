import os
import sqlite3
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from predictor import GRUNet


def _load_recent_spreads(db_path: str, limit: int = 2500):
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT spread FROM llm_decisions WHERE spread IS NOT NULL ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    spreads = [float(r[0]) for r in rows if r[0] is not None]
    spreads.reverse()
    return spreads


def retrain_gru_from_db(
    db_path: str = "arbitrage.db",
    model_path: str = "gru_model.pth",
    scaler_path: str = "scaler_params.npy",
    sequence_length: int = 10,
    min_points: int = 80,
    epochs: int = 2,
    batch_size: int = 32,
):
    spreads = _load_recent_spreads(db_path=db_path)
    if len(spreads) < max(min_points, sequence_length + 20):
        return False, f"Insufficient spread samples: {len(spreads)}"

    data = np.array(spreads, dtype=np.float32).reshape(-1, 1)
    min_val = float(np.min(data))
    max_val = float(np.max(data))
    scale = max_val - min_val
    if scale <= 1e-9:
        return False, "Spread variance too low for training"

    scaled = (data - min_val) / scale
    X, y = [], []
    for i in range(sequence_length, len(scaled)):
        X.append(scaled[i - sequence_length : i, 0])
        y.append(scaled[i, 0])

    if len(X) < 20:
        return False, "Not enough sequence samples after windowing"

    X_t = torch.tensor(np.array(X).reshape(-1, sequence_length, 1), dtype=torch.float32)
    y_t = torch.tensor(np.array(y).reshape(-1, 1), dtype=torch.float32)
    train_loader = DataLoader(TensorDataset(X_t, y_t), batch_size=batch_size, shuffle=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GRUNet(1, 50, 1, 2).to(device)
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device))

    model.train()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    for _ in range(epochs):
        for inputs, labels in train_loader:
            inputs = inputs.to(device)
            labels = labels.to(device)
            h = torch.zeros(2, inputs.size(0), 50, device=device)
            optimizer.zero_grad()
            output, _ = model(inputs, h)
            loss = criterion(output, labels)
            loss.backward()
            optimizer.step()

    torch.save(model.state_dict(), model_path)
    np.save(scaler_path, np.array([min_val, max_val], dtype=np.float32))
    return True, {"samples": len(spreads), "epochs": epochs}
