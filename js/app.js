
var app = angular.module('querypanel', []);

app.service('queryPanelService', ['$templateCache', function($templateCache) {

	/**
	 * 初始化一个对象作为存储查询条件的Map，方便判断。
	 * 
	 * @return {[type]} 查询条件Map
	 */
	this.initialConditionMap = function() {
		return new ConditionMap();
	}
	function ConditionMap() {};
	/**
	 * 是否包含该字段
	 * 
	 * @param  {[type]}  field 字段名
	 * @return {Boolean} 是否包含
	 */
	ConditionMap.prototype.hasField = function(field) {
		return this.hasOwnProperty(field);
	}
	/**
	 * 设置字段
	 * 
	 * @param {[type]} condition 查询条件
	 */
	ConditionMap.prototype.setField = function(condition) {
		if (!this.hasField(condition.field) || !condition.isMulti) {
			this[condition.field] = {};
		}
		this[condition.field][condition.value] = condition.text;
		if (!this[condition.field]._length) {
			this[condition.field]._length = 1;
		} else {
			this[condition.field]._length++;
		}
	}
	/**
	 * 移除字段
	 * 
	 * @param  {[type]} condition   查询条件
	 * @param  {[type]} withouCheck 是否检查标志(为true则直接delete该属性，
	 *           否则深入value对象内部继续判断，主要用于有多选的查询条件)
	 * @return {[type]}             是否删除了map上面的属性
	 */
	ConditionMap.prototype.removeField = function(condition, withouCheck) {
		var deleteField = false;
		if (condition.isMulti && !withouCheck) {
			if (this.hasItem(condition)) {
				delete this[condition.field][condition.value];
				if (--this[condition.field]._length == 0) {
					delete this[condition.field];
					deleteField = true;
				}
			}
		} else {
			delete this[condition.field];
			deleteField = true;
		}
		return deleteField;
	}
	/**
	 * 判断是否包含了某一个字段的具体枚举值
	 * 
	 * @param  {[type]}  condition 查询条件
	 * @return {Boolean}           是否包含
	 */
	ConditionMap.prototype.hasItem = function(condition) {
		return this.hasField(condition.field) && this[condition.field].hasOwnProperty(condition.value);
	}
}]);

app.directive('queryPanel', ['$http', 'queryPanelService', function($http, queryPanelService) {
	return {
		scope: {},
		templateUrl: 'js/queryPanelTemplate.html',
		controller: ['$scope', function(scope) {
			// controller里暴露方法给子指令使用：
			this.getConditionMap = function() {
				return scope.conditionMap;
			}
			this.getSelectedBox = function() {
				return scope.selectedBox;
			}
			/**
			 * 添加查询条件(通用)
			 *
			 * @param {[type]} condition 查询条件
			 */
			this.addCondition = function(condition) {
				var conditionMap = scope.conditionMap;
				var selectedBox = scope.selectedBox;
				if (conditionMap.hasField(condition.field)) {
					for (var i = 0; i < selectedBox.length; i++) {
						if (selectedBox[i].field === condition.field) {
							selectedBox[i].text = condition.text;
							selectedBox[i].value = condition.value;
							break;
						}
					}
				} else {
					selectedBox.push(condition);
				}
				conditionMap.setField(condition);	
			}
			/**
			 * 删除查询条件(通用)
			 *
			 * @param {[type]} condition 查询条件
			 */
			this.removeCondition = function(condition) {
				var conditionMap = scope.conditionMap;
				var selectedBox = scope.selectedBox;
				if (conditionMap.hasField(condition.field)) {
					for (var i = 0; i < selectedBox.length; i++) {
						if (selectedBox[i].field === condition.field) {
							selectedBox.splice(i, 1);
							break;
						}						
					}
					conditionMap.removeField(condition, true);
				}
			}
		}],
		link: function(scope, element, attrs) {
			$http.get('data.json').then(function(res) {
				scope.fields = res.data;
			});

			// 存储查询条件的Map
			scope.conditionMap = queryPanelService.initialConditionMap();
			// 已选择的查询条件展示数组
			scope.selectedBox = [];

			/**
			 * 删除查询条件(点击【已选择】上的查询项)
			 * 
			 * @param index
			 */
			scope.removeCondition = function(index) {
				var deleteCondition = scope.selectedBox.splice(index, 1);
				scope.conditionMap.removeField(deleteCondition[0], true);
				scope.$broadcast('remove-condition', deleteCondition[0].field);
				console.log(scope.conditionMap, scope.selectedBox);
			}
		}
	}
}]);

/**
 * 查询面板中row对应的指令
 * 根据不同的类型(enum/text/date...)重新编译成对应的指令
 */
app.directive('queryPanelField', ['$compile', '$timeout', 'queryPanelService', function($compile, $timeout, queryPanelService) {
	return {
		restrict: 'A',
		scope: {
			option: '=',
			index: '@'
		},
		require: '^?queryPanel',
		compile: function() {
			return {
				pre: function(scope, element, attrs) {
					var option = scope.option;
					// 根据type编译成对应的指令
					var template  = angular.element("<div class='field' ng-class=\"{'first': index === 0}\" query-panel-field-" + option.type +" option='option'></div>");
					var newElement = $compile(template)(scope);
					element.replaceWith(newElement);
				}
			}
		}
	}
}]);

/**
 * 枚举查询条件指令
 * isMulti: 是否多选
 */
app.directive('queryPanelFieldEnum', ['$timeout', 'queryPanelService', function($timeout, queryPanelService) {
	return {
		restrict: 'A',
		scope: {
			option: "="
		},
		require: '^?queryPanel',
		templateUrl: 'query-panel/enum',
		link: function(scope, element, attrs, parentCtrl) {

			var option = scope.option;
			scope.items = option.items;
			scope.title = option.title;
			scope.field = option.field;
			(scope.isMulti = option.isMulti) && (scope.selectedArray = []);
			// 显示/隐藏更多数据
			scope.fieldExpand = false;

			/**
			 * 点击查询条件触发事件
			 * 
			 * @param item 选中的枚举
			 */
			scope.addCondition = function(item, index) {

				var selectedBox = parentCtrl.getSelectedBox();
				var conditionMap = parentCtrl.getConditionMap();
				var field = scope.field;
				var isMulti = scope.isMulti;
				var addConditionFlag = false;
				var removeConditionFlag = false;
				var condition = angular.extend({},
					item, {index: index}, {
						isMulti: scope.isMulti,
						field: scope.field,
						title: scope.title
					}
				);

				if (isMulti) {
					if (scope.selectedArray[index]) {
						scope.selectedArray[index] = undefined;
						// 删除选中的枚举项
						removeConditionFlag = true;
					} else {
						scope.selectedArray[index] = true;
						// add condition item
						addConditionFlag = true;
					}					
				} else if (scope.selectedIndex !== index) {
					scope.selectedIndex = index;
					// add condition item
					addConditionFlag = true;							
				}

				if (addConditionFlag) {
					// 添加条件时根据单选/多选执行操作
					if (isMulti) {
						if (conditionMap.hasField(field)) {
							for (var i = 0; i < selectedBox.length; i++) {
								if (selectedBox[i].field === field) {
									selectedBox[i].textArray.push(condition.text);
									selectedBox[i].valueArray.push(condition.value);
									selectedBox[i].text = selectedBox[i].textArray.join(',');
									selectedBox[i].value = selectedBox[i].valueArray.join(',');
									break;
								}
							}
						} else {
							selectedBox.push(condition);
							selectedBox[selectedBox.length - 1].textArray = [condition.text];
							selectedBox[selectedBox.length - 1].valueArray = [condition.value];
						}
						conditionMap.setField(condition);
					} else {
						parentCtrl.addCondition(condition);

					}
				} else if (removeConditionFlag) {
					// 删除选中的枚举项（多选时特有）
					var hasDeletedField = conditionMap.removeField(condition);
					for (var i = 0; i < selectedBox.length; i++) {
						if (selectedBox[i].field === condition.field) {
							if (hasDeletedField) {
								selectedBox.splice(i, 1);
							} else {
								for (var j = 0; j < selectedBox[i].valueArray.length; j++) {
									if (selectedBox[i].valueArray[j] === condition.value) {
										selectedBox[i].valueArray.splice(j, 1);
										selectedBox[i].textArray.splice(j, 1);
										selectedBox[i].text = selectedBox[i].textArray.join(',');
										selectedBox[i].value = selectedBox[i].valueArray.join(',');
										break;
									}
								}
							}
							break;
						}
					}
				}
				console.log(conditionMap, selectedBox);
			}
			/**
			 * 判断该条件是否被选中
			 * 
			 * @param index
			 */
			scope.setItemClass = function(index) {
				if (scope.isMulti) {
					return scope.selectedArray[index];
				} else {
					return scope.selectedIndex == index;
				}
			}
			/**
			 * 监听查询条件移除事件
			 */
			scope.$on('remove-condition', function(event, field) {
				if (field === scope.field) {
					if (scope.isMulti) {
						scope.selectedArray = [];
					} else {
						scope.selectedIndex = undefined;
					}
				}
			});
			// 判断【更多/收起】按钮的显示隐藏
			$timeout(function() {
				scope.showMoreBtn = element.find('ul')[0].offsetHeight > 36;
			});
		}
	}
}]);

/**
 * 数字查询条件指令
 */
app.directive('queryPanelFieldNumber', [function() {
	return {
		restrict: 'A',
		scope: {
			option: "="
		},
		require: '^?queryPanel',
		templateUrl: 'query-panel/number',
		link: function(scope, element, attrs, parentCtrl) {

			/**
			 * 确定按钮添加查询条件
			 */
			scope.addCondition = function () {
				var option = scope.option;
				var text = '';
				var value;
				var preventAction = false;
				var lessNumber = scope.lessNumber;
				var moreNumber = scope.moreNumber;
				if (lessNumber) {
					if (moreNumber) {
						text = lessNumber + ' - ' + moreNumber;
						value = lessNumber + '-' + moreNumber;
					} else {
						text = '>=' + lessNumber;
						value = lessNumber + '-';
					}
				} else {
					if (moreNumber) {
						text = '<=' + moreNumber;
						value = '-' + moreNumber;
					} else {
						preventAction = true;
					}
				}
				if (!preventAction) {
					var condition = {
						field: option.field,
						title: option.title,
						text: text,
						value: value
					}
					parentCtrl.addCondition(condition);
				} else {
					// 两个input框为空时去除查询条件
					parentCtrl.removeCondition(condition);
				}
			}

			/**
			 * 监听查询条件移除事件
			 */
			scope.$on('remove-condition', function(event, field) {
				if (field === scope.option.field) {
					scope.lessNumber = null;
					scope.moreNumber = null;
				}
			});
		}
	}
}]);

/**
 * 文本查询条件指令
 */
app.directive('queryPanelFieldText', ['$timeout', function($timeout) {
	return {
		restrict: 'A',
		scope: {
			option: "="
		},
		require: '^?queryPanel',
		templateUrl: 'query-panel/text',
		link: function(scope, element, attrs, parentCtrl) {
			var timeout, option = scope.option;
			scope.addCondition = function() {
				if (timeout) $timeout.cancel(timeout);
				timeout = $timeout(function() {
					var condition = {
						field: option.field,
						title: option.title,
						text: scope.textInput,
						value: scope.textInput						
					}
					if (scope.textInput !== '') {
						parentCtrl.addCondition(condition)
					} else {
						parentCtrl.removeCondition(condition);
					}
				}, 800);
			}

			/**
			 * 监听查询条件移除事件
			 */
			scope.$on('remove-condition', function(event, field) {
				if (field === scope.option.field) {
					scope.textInput = null;
				}
			});
			scope.$on('$destroy', function() {
				$timeout.cancel(timeout);
			})
		}
	}
}]);

/**
 * 日期查询条件指令
 */
app.directive('queryPanelFieldDate', [function() {
	return {
		restrict: 'A',
		scope: {
			option: '='
		}
	}
}]);

app.run(['$templateCache', function($templateCache) {

	$templateCache.put('query-panel/enum', 
		'<div class="field-title">{{::title}}：</div>' + 
		'<div class="field-content" ng-class="{\'expanded\': fieldExpand}">' +
			'<div class="items-wrapper">' +
				'<ul class="items">' + 
					'<li ng-repeat="item in items track by $index" ng-click="addCondition(item, $index)" ng-class="{\'selected\': setItemClass($index)}">' +
					'<span class="icon-filter" ng-class="{\'selected\': setItemClass($index)}" ng-show="option.isMulti"></span><span class="item-text">{{::item.text}}</span>' + 
					'</li>' + 
				'</ul>' + 
			'</div>' + 
		'</div>' + 
		'<div class="field-operation">' +
			'<span class="show-more" ng-show="showMoreBtn" ng-click="fieldExpand = !fieldExpand;">{{fieldExpand ? "收起": "更多"}}<i class="glyphicon" ng-class="{true: \'glyphicon-menu-up\', false: \'glyphicon-menu-down\'}[fieldExpand]"></i></span>' +
		'</div>'
	);

	$templateCache.put('query-panel/f7',
		''
	);

	$templateCache.put('query-panel/text',
		'<div class="field-title">{{::option.title}}：</div>' +
		'<div class="field-content"><div class="text-wrapper">' +
			'<input ng-model="textInput" ng-change="addCondition()"/>' +
		'</div></div>'
	);

	$templateCache.put('query-panel/number',
		'<div class="field-title">{{::option.title}}：</div>' +
		'<div class="field-content"><div class="price-wrapper">' +
			'<input type="number" ng-model="lessNumber"/><em class="split">-</em><input type="number" ng-model="moreNumber"/>' + 
			'<a class="btn-confirm" href="javascript:void(0)" ng-click="addCondition()">确定</a>' +
		'</div></div>' +
		'<div class="field-operation">' +
		'</div>'
	);

	$templateCache.put('query-panel/date',
		''
	);
}])