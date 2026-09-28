#!/bin/bash
cd "$(dirname "$0")"
python3 m3d_run.py 1.5 15 200 near0,far0 > m3d_h1.5_imu15_free.out 2>&1
python3 m3d_run.py 2.0 20,40 200 near,far > m3d_h2.0.out 2>&1
python3 m3d_run.py 1.5 40,50,60 150 near,far > m3d_h1.5_zd150.out 2>&1
python3 m3d_run.py 1.5 40,50 250 near,far > m3d_h1.5_zd250.out 2>&1
python3 m3d_run.py 1.0 20,40 200 near,far > m3d_h1.0.out 2>&1
python3 m3d_run.py 1.5 20,40 200 near,far 6.0 > m3d_h1.5_gap6.out 2>&1
python3 m3d_run.py 1.5 20,40 200 near,far 12.0 > m3d_h1.5_gap12.out 2>&1
python3 m3d_run.py 1.5 60 200 near,far > m3d_h1.5_imu60.out 2>&1
