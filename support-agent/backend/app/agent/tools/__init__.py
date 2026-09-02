from app.agent.tools.create_ticket import create_ticket
from app.agent.tools.dummy import get_current_time
from app.agent.tools.escalate_to_human import escalate_to_human
from app.agent.tools.get_ticket_status import get_ticket_status
from app.agent.tools.search_knowledge_base import search_knowledge_base

ALL_TOOLS = [
    get_current_time,
    search_knowledge_base,
    create_ticket,
    get_ticket_status,
    escalate_to_human,
]
