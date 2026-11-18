import cv2
import numpy as np


def resize_frame(image: np.ndarray, max_dim: int = 560) -> np.ndarray:
    h, w = image.shape[:2]
    if max(h, w) <= max_dim:
        return image.copy()
    scale = max_dim / float(max(h, w))
    new_w = max(32, int(round(w * scale)))
    new_h = max(32, int(round(h * scale)))
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def preprocess_image(
    image: np.ndarray,
    gaussian_kernel: int = 5,
    contrast_alpha: float = 1.45,
) -> dict:
    """
    Steps 1-4: Resize, Grayscale conversion, Gaussian Blur, and CLAHE Contrast Enhancement.
    """
    resized = resize_frame(image, 560)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    k = max(3, gaussian_kernel if gaussian_kernel % 2 == 1 else gaussian_kernel + 1)
    blurred = cv2.GaussianBlur(gray, (k, k), 0)

    mean_val = float(np.mean(blurred))
    stretched = np.clip(
        (blurred.astype(np.float32) - mean_val) * contrast_alpha + 128.0 + (mean_val - 128.0) * 0.65,
        0,
        255,
    ).astype(np.uint8)

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(6, 6))
    eq = clahe.apply(stretched)
    enhanced = cv2.addWeighted(stretched, 0.6, eq, 0.4, 0)

    return {
        "original": resized,
        "grayscale": gray,
        "blurred": blurred,
        "enhanced": enhanced,
    }
