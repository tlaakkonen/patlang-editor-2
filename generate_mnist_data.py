#!/usr/bin/env python3
"""
Download MNIST and build a single float32 tensor of shape (60000, 794):
- 50000 examples from the training set (first 50000)
- 10000 examples from the test set
Each row: [flattened_image(784) normalized to [0,1], one_hot_label(10)]
Save as a binary file in row-major format, float32 little-endian (4 bytes per float).
"""
import argparse
import os
from typing import Tuple

import numpy as np
import torch
from torchvision import datasets, transforms


def build_mnist_combined_tensor(data_dir: str = "data", train_count: int = 50000) -> torch.Tensor:
    """Download MNIST and construct the combined tensor.

    Args:
        data_dir: directory where torchvision will download the MNIST data.
        train_count: number of train examples to take from the training split (default 50000).

    Returns:
        A torch.Tensor of shape (60000, 794) dtype=torch.float32.
    """
    # transform ToTensor() yields floats in [0.0, 1.0] with shape (1,28,28)
    transform = transforms.ToTensor()

    # Download datasets if needed
    train_ds = datasets.MNIST(root=data_dir, train=True, download=True, transform=transform)
    test_ds = datasets.MNIST(root=data_dir, train=False, download=True, transform=transform)

    if train_count < 0 or train_count > len(train_ds):
        raise ValueError(f"train_count must be between 0 and {len(train_ds)}")

    if len(test_ds) != 10000:
        raise RuntimeError("Unexpected test set size from torchvision MNIST")

    total = train_count + len(test_ds)
    if total != 60000:
        # user requested combined 60000 -> We allow train_count other than 50000, but warn
        print(f"Note: requested train_count={train_count}, combined total={total}")

    rows = total
    cols = 784 + 10  # flattened image + one-hot label

    out = torch.empty((rows, cols), dtype=torch.float32)

    # helper to write into out
    idx = 0

    # Fill from train set (take first train_count elements)
    for i in range(train_count):
        img, label = train_ds[i]
        # img is (1,28,28) tensor in [0,1]
        img_flat = img.view(-1)  # 784
        one_hot = torch.nn.functional.one_hot(torch.tensor(label, dtype=torch.long), num_classes=10).to(torch.float32)
        row = torch.cat((img_flat, one_hot), dim=0)
        out[idx] = row
        idx += 1

    # Fill from test set (all 10000)
    for i in range(len(test_ds)):
        img, label = test_ds[i]
        img_flat = img.view(-1)
        one_hot = torch.nn.functional.one_hot(torch.tensor(label, dtype=torch.long), num_classes=10).to(torch.float32)
        row = torch.cat((img_flat, one_hot), dim=0)
        out[idx] = row
        idx += 1

    assert idx == rows, f"Filled rows {idx} != expected {rows}"

    return out


def save_tensor_to_binary_le_float32(tensor: torch.Tensor, out_path: str) -> None:
    """Save a torch tensor of dtype float32 as a binary file of little-endian float32 values in row-major order.

    This function converts to a numpy array with dtype '<f4' (little-endian 32-bit float) and uses numpy.tofile,
    ensuring row-major order is preserved.
    """
    if not tensor.is_contiguous():
        tensor = tensor.contiguous()

    if tensor.dtype != torch.float32:
        tensor = tensor.to(dtype=torch.float32)

    arr = tensor.numpy()

    # Ensure little-endian float32 representation explicitly
    arr_le = arr.astype('<f4')

    # Create parent dir
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)

    # Write raw bytes in row-major order
    arr_le.tofile(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MNIST combined tensor and save as little-endian float32 binary file")
    parser.add_argument("--data-dir", default="data", help="Directory to download MNIST data into")
    parser.add_argument("--train-count", type=int, default=50000, help="Number of train examples to use from the training split (default 50000)")
    parser.add_argument("--out", default="mnist_60000x794_le_float32.bin", help="Output binary file path")
    args = parser.parse_args()

    print(f"Downloading/reading MNIST into '{args.data_dir}' and building tensor (train_count={args.train_count})...")
    tensor = build_mnist_combined_tensor(data_dir=args.data_dir, train_count=args.train_count)

    print(f"Tensor built: shape={tuple(tensor.shape)}, dtype={tensor.dtype}")

    # Verify size
    expected_rows = args.train_count + 10000
    expected_cols = 784 + 10
    if tensor.shape != (expected_rows, expected_cols):
        raise RuntimeError(f"Unexpected tensor shape {tensor.shape}, expected {(expected_rows, expected_cols)}")

    print(f"Saving to '{args.out}' as little-endian float32 (row-major)...")
    save_tensor_to_binary_le_float32(tensor, args.out)

    # Report written bytes
    num_floats = tensor.numel()
    bytes_written = int(num_floats * 4)
    print(f"Wrote {bytes_written} bytes ({num_floats} float32 values) to {args.out}")

    # Quick sanity check on file size
    actual_size = os.path.getsize(args.out)
    if actual_size != bytes_written:
        print(f"Warning: expected file size {bytes_written}, actual {actual_size}")
    else:
        print("File size check OK")


if __name__ == '__main__':
    main()