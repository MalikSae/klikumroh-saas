ALTER TABLE prospects ADD COLUMN entry_method ENUM('web_form', 'agent_manual') NOT NULL DEFAULT 'web_form' AFTER source_channel;
