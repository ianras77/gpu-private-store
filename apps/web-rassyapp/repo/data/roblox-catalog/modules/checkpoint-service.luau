local CheckpointService = {}

local playerCheckpointById = {}

function CheckpointService.registerCheckpoint(_part, checkpointId)
	playerCheckpointById[checkpointId] = true
end

function CheckpointService.resetPlayer(_player)
	return nil
end

return CheckpointService
