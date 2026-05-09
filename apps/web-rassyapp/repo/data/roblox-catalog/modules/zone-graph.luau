local ZoneGraph = {}
ZoneGraph.__index = ZoneGraph

function ZoneGraph.new(zoneDefinitions)
	local self = setmetatable({}, ZoneGraph)
	self._zones = zoneDefinitions or {}
	return self
end

function ZoneGraph:getNextZones(zoneId)
	local zone = self._zones[zoneId]
	if not zone or type(zone.next) ~= "table" then
		return {}
	end
	return zone.next
end

function ZoneGraph:getSpawnZone()
	for zoneId, zone in pairs(self._zones) do
		if zone.isSpawn then
			return zoneId
		end
	end
	return nil
end

return ZoneGraph
