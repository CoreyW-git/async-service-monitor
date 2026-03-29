from __future__ import annotations

from pathlib import Path
import sys


def main() -> int:
    try:
        from diagrams import Cluster, Diagram, Edge
        from diagrams.generic.blank import Blank
        from diagrams.onprem.container import Docker
        from diagrams.onprem.database import PostgreSQL
        from diagrams.onprem.inmemory import Redis
        from diagrams.onprem.monitoring import Grafana
        from diagrams.programming.framework import FastAPI
        from diagrams.programming.language import Python
        from diagrams.storage.object import Storage
    except Exception as error:  # pragma: no cover - helper script
        print("The optional 'diagrams' toolchain is not available.", file=sys.stderr)
        print("Install with: pip install -e .[docs] and ensure Graphviz is installed.", file=sys.stderr)
        print(f"Import error: {error}", file=sys.stderr)
        return 1

    output_dir = Path(__file__).resolve().parents[1] / "src" / "service_monitor" / "web" / "help_assets"
    output_dir.mkdir(parents=True, exist_ok=True)

    with Diagram(
        "architecture-overview",
        filename=str(output_dir / "architecture-overview"),
        outformat="svg",
        show=False,
        direction="LR",
    ):
        portal = FastAPI("Admin Portal")
        config = Python("Config Store")
        runner = Python("Monitor Runner")
        targets = Blank("Checks + Targets")
        live = Grafana("Live Dashboards")
        pg = PostgreSQL("PostgreSQL")
        obj = Storage("MinIO / OCI Objects")
        portal >> config >> runner >> targets
        runner >> live
        runner >> pg
        runner >> obj

    with Diagram(
        "monitor-lifecycle",
        filename=str(output_dir / "monitor-lifecycle"),
        outformat="svg",
        show=False,
        direction="LR",
    ):
        create = Blank("Create")
        place = Docker("Place")
        execute = Python("Execute")
        observe = Grafana("Observe")
        tune = Blank("Tune")
        create >> place >> execute >> observe >> tune
        observe >> Edge(label="feedback") >> tune

    with Diagram(
        "telemetry-data-layer",
        filename=str(output_dir / "telemetry-data-layer"),
        outformat="svg",
        show=False,
        direction="LR",
    ):
        run = Blank("Monitor Run")
        telemetry = Python("Telemetry Store")
        with Cluster("Hot / Live"):
            cache = Redis("Monitor State")
            dashboard = Grafana("Dashboards")
        with Cluster("Retained"):
            pg = PostgreSQL("Time Series")
            obj = Storage("Diagnostics")
        run >> telemetry
        telemetry >> cache >> dashboard
        telemetry >> pg
        telemetry >> obj

    print(f"Generated help diagrams in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
