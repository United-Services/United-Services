"""app/failover/mirror_sync.py's table-name guard. The Semgrep
avoid-sqlalchemy-text finding flagged every text()-built query here as a
theoretical injection risk — not exploitable today (table always comes
from the hardcoded TABLES_IN_FK_ORDER list, never request input), but
_validated_table turns that "safe because of where callers happen to be
today" into an actual runtime-enforced guarantee."""

import pytest

from app.failover.mirror_sync import TABLES_IN_FK_ORDER, _validated_table


@pytest.mark.parametrize("table", TABLES_IN_FK_ORDER)
def test_known_tables_pass_through_unchanged(table):
    assert _validated_table(table) == table


def test_unknown_table_name_rejected():
    with pytest.raises(ValueError, match="unrecognized table"):
        _validated_table("users")


def test_injection_attempt_rejected():
    with pytest.raises(ValueError, match="unrecognized table"):
        _validated_table("tickets; DROP TABLE tickets;--")
