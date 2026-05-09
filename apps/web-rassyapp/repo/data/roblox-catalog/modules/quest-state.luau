local QuestState = {}

local questProgress = {}

function QuestState.beginQuest(_player, questId)
	questProgress[questId] = { started = true, completedSteps = {} }
end

function QuestState.completeStep(_player, questId, stepId)
	local quest = questProgress[questId]
	if not quest then
		return
	end

	quest.completedSteps[stepId] = true
end

function QuestState.getQuestSummary(_player)
	return questProgress
end

return QuestState
