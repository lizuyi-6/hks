from apps.worker.main import main


def test_worker_entrypoint_exists():
    assert callable(main)

