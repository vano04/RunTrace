import time


for step, loss in enumerate([3.62, 3.51, 3.43, 3.36, 3.30], start=1):
    print(f"RUNTRACE_METRIC validation_loss={loss} step={step}", flush=True)
    if step == 3:
        print('RUNTRACE_EVENT level=info message="Convergence remains stable"', flush=True)
    time.sleep(0.1)

