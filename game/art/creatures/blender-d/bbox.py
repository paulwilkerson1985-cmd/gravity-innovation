import sys
from PIL import Image
import numpy as np
for p in sys.argv[1:]:
    a = np.array(Image.open(p).convert('RGBA'))[:, :, 3] > 8
    ys, xs = np.where(a)
    print(p.split('/')[-1], a.shape, 'x', xs.min(), xs.max(), 'y', ys.min(), ys.max(), 'height', ys.max()-ys.min(), 'cx', (xs.min()+xs.max())/2)
