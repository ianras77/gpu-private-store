local RewardPop = {}

function RewardPop.show(_player, title, subtitle)
	return {
		title = title,
		subtitle = subtitle
	}
end

function RewardPop.preview(message)
	return message
end

return RewardPop
