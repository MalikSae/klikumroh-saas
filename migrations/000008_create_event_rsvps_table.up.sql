CREATE TABLE event_rsvps (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    BIGINT UNSIGNED NOT NULL,
    agent_id    BIGINT UNSIGNED NOT NULL,
    status      ENUM('going','maybe','not_going') NOT NULL DEFAULT 'going',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES agent_events(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    UNIQUE KEY uniq_event_agent (event_id, agent_id)
);
