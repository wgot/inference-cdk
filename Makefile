search-instance-type:
	@curl -s https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonSageMaker/current/index.json | \
	jq -r '\
	def selectProducts: \
		.products \
		| to_entries[] \
		| select( \
			.value.productFamily == "ML Instance" \
			and .value.attributes.component == "Hosting" \
			and .value.attributes.regionCode == "ap-northeast-1" \
			and (try (.value.attributes.vCpu | tonumber) catch 0) > 8 \
			and ((try (.value.attributes.gpuMemory | tonumber) catch 0) * (try (.value.attributes.gpu | tonumber) catch 0)) > 16 \
		) \
		| {sku: .key, instanceName: .value.attributes.instanceName, vCpu: .value.attributes.vCpu, memory: .value.attributes.memory, physicalGpu: .value.attributes.physicalGpu, gpu: .value.attributes.gpu, gpuMemory: .value.attributes.gpuMemory}; \
	\
	def selectTerms: \
		.terms.OnDemand \
		| to_entries[] \
		| .value \
		| to_entries[] \
		| {sku: .value.sku, USD: .value.priceDimensions | to_entries[0].value.pricePerUnit.USD}; \
	\
	def mergeAndFilter:  \
		group_by(.sku) \
		| map(reduce .[] as $$item ({}; . + $$item)) \
		| map(select(.instanceName != null)) \
		| sort_by(.USD | tonumber); \
	\
	[selectProducts] + [selectTerms] | mergeAndFilter \
	| (.[0] | to_entries | map(.key)), (.[] | [.[]]) | @csv'
