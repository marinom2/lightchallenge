// Templates.swift
// Fitness challenge templates — ported from webapp/lib/templates.ts.

import Foundation

// MARK: - Template Field

enum TemplateFieldKind {
    case number(min: Double?, max: Double?, step: Double?, defaultValue: Double?)
    case select(options: [(value: String, label: String)], defaultValue: String?)
    case text(defaultValue: String?)
}

struct TemplateField: Identifiable {
    let id: String  // key
    let key: String
    let label: String
    let kind: TemplateFieldKind
    let hint: String?

    init(key: String, label: String, kind: TemplateFieldKind, hint: String? = nil) {
        self.id = key
        self.key = key
        self.label = label
        self.kind = kind
        self.hint = hint
    }
}

// MARK: - Template

struct ChallengeTemplate: Identifiable {
    let id: String
    let name: String
    let hint: String?
    let fitnessKind: String           // "steps", "running", "cycling", "hiking", "swimming", "strength"
    let kindId: ChallengeKindId
    let modelId: String
    let modelHash: String
    let fields: [TemplateField]
    let paramsBuilder: ([String: Any]) -> [String: Any]
    let ruleBuilder: ([String: Any], Date, Date) -> [String: Any]
}

// MARK: - Template Registry

enum FitnessTemplates {
    static let all: [ChallengeTemplate] = [
        stepsDailyTemplate,
        runningDistanceTemplate,
        walkingDistanceTemplate,
        cyclingDistanceTemplate,
        hikingElevationTemplate,
        swimmingLapsTemplate,
        strengthWorkoutTemplate,
        yogaDurationTemplate,
        hiitSessionsTemplate,
        rowingDistanceTemplate,
        calorieBurnTemplate,
        exerciseTimeTemplate,
        stepsCompetitiveTemplate,
        distanceCompetitiveTemplate,
        durationThresholdTemplate,
    ]

    static func templates(for kind: String) -> [ChallengeTemplate] {
        all.filter { $0.fitnessKind == kind }
    }

    // MARK: - Steps

    private static let stepsDailyTemplate = ChallengeTemplate(
        id: "steps_daily",
        name: "Steps — Every Day",
        hint: "Hit a daily step target for a number of consecutive days",
        fitnessKind: "steps",
        kindId: .steps,
        modelId: "fitness.steps@1",
        modelHash: ServerConfig.fitnessStepsHash,
        fields: [
            TemplateField(key: "minSteps", label: "Minimum Steps per Day", kind: .number(min: 100, max: nil, step: 500, defaultValue: 8000)),
            TemplateField(key: "days", label: "Consecutive Days", kind: .number(min: 1, max: 90, step: 1, defaultValue: 7)),
        ],
        paramsBuilder: { args in
            [
                "days": args["days"] ?? 7,
                "minSteps": args["minSteps"] ?? 8000,
            ]
        },
        ruleBuilder: { args, start, end in
            [
                "challengeType": "steps",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                    "timezone": TimeZone.current.identifier,
                ],
                "dailyTarget": [
                    "consecutiveDays": args["days"] ?? 7,
                    "conditions": [
                        ["metric": "steps_count", "op": ">=", "value": args["minSteps"] ?? 8000]
                    ],
                ],
            ]
        }
    )

    private static let stepsCompetitiveTemplate = ChallengeTemplate(
        id: "steps_competitive",
        name: "Steps Competition",
        hint: "Compete for the highest step count. Top finishers win.",
        fitnessKind: "steps",
        kindId: .steps,
        modelId: "fitness.steps@1",
        modelHash: ServerConfig.fitnessStepsHash,
        fields: [
            TemplateField(key: "topN", label: "Top N Winners", kind: .number(min: 1, max: 100, step: 1, defaultValue: 3)),
        ],
        paramsBuilder: { args in
            [
                "mode": "competitive",
                "metric": "steps_count",
                "topN": args["topN"] ?? 3,
            ]
        },
        ruleBuilder: { args, start, end in
            [
                "challengeType": "steps",
                "mode": "competitive",
                "metric": "steps_count",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                    "timezone": TimeZone.current.identifier,
                ],
            ]
        }
    )

    private static let distanceCompetitiveTemplate = ChallengeTemplate(
        id: "distance_competitive",
        name: "Distance Competition",
        hint: "Compete: whoever covers the most distance wins.",
        fitnessKind: "running",
        kindId: .running,
        modelId: "fitness.distance@1",
        modelHash: ServerConfig.fitnessDistanceHash,
        fields: [
            TemplateField(key: "activityType", label: "Activity Type", kind: .select(
                options: [
                    (value: "run", label: "Running"),
                    (value: "walk", label: "Walking"),
                    (value: "cycle", label: "Cycling"),
                ],
                defaultValue: "run"
            )),
            TemplateField(key: "topN", label: "Number of Winners", kind: .number(min: 1, max: 100, step: 1, defaultValue: 1)),
        ],
        paramsBuilder: { args in
            [
                "mode": "competitive",
                "metric": "distance_km",
                "topN": args["topN"] ?? 1,
            ]
        },
        ruleBuilder: { args, start, end in
            let actType = args["activityType"] as? String ?? "run"
            return [
                "challengeType": actType,
                "mode": "competitive",
                "competitiveMetric": "distance_km",
                "topN": args["topN"] ?? 1,
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                    "timezone": TimeZone.current.identifier,
                ],
            ]
        }
    )

    // MARK: - Running

    private static let runningDistanceTemplate = ChallengeTemplate(
        id: "running_window",
        name: "Running — Distance Target",
        hint: "Accumulate running distance within the challenge window",
        fitnessKind: "running",
        kindId: .running,
        modelId: "fitness.distance@1",
        modelHash: ServerConfig.fitnessDistanceHash,
        fields: [
            TemplateField(key: "distanceKm", label: "Target Distance (km)", kind: .number(min: 1, max: nil, step: 0.5, defaultValue: 5)),
        ],
        paramsBuilder: { args in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "minMeters": Int(km * 1000),
                "types": "run,walk",
            ]
        },
        ruleBuilder: { args, start, end in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "challengeType": "run",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "weeklyTarget": [
                    "minOccurrences": 1,
                    "perWeeks": 1,
                ],
                "conditions": [
                    ["metric": "distance_km", "op": ">=", "value": km]
                ],
            ]
        }
    )

    // MARK: - Cycling

    private static let cyclingDistanceTemplate = ChallengeTemplate(
        id: "cycling_window",
        name: "Cycling — Distance Target",
        hint: "Accumulate cycling distance within the challenge window",
        fitnessKind: "cycling",
        kindId: .cycling,
        modelId: "fitness.cycling@1",
        modelHash: ServerConfig.fitnessCyclingHash,
        fields: [
            TemplateField(key: "distanceKm", label: "Target Distance (km)", kind: .number(min: 1, max: nil, step: 1, defaultValue: 20)),
        ],
        paramsBuilder: { args in
            let km = args["distanceKm"] as? Double ?? 20.0
            return [
                "minMeters": Int(km * 1000),
                "types": "ride,cycle",
            ]
        },
        ruleBuilder: { args, start, end in
            let km = args["distanceKm"] as? Double ?? 20.0
            return [
                "challengeType": "cycle",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "distance_km", "op": ">=", "value": km]
                ],
            ]
        }
    )

    // MARK: - Hiking

    private static let hikingElevationTemplate = ChallengeTemplate(
        id: "hiking_elev_gain",
        name: "Hiking — Elevation Gain",
        hint: "Accumulate elevation gain from hiking activities",
        fitnessKind: "hiking",
        kindId: .hiking,
        modelId: "fitness.hiking@1",
        modelHash: ServerConfig.fitnessHikingHash,
        fields: [
            TemplateField(key: "elevGainM", label: "Target Elevation (meters)", kind: .number(min: 50, max: nil, step: 50, defaultValue: 500)),
        ],
        paramsBuilder: { args in
            [
                "minElevGainM": args["elevGainM"] ?? 500,
                "types": "walk,hike",
            ]
        },
        ruleBuilder: { args, start, end in
            let gain = args["elevGainM"] as? Double ?? 500.0
            return [
                "challengeType": "hike",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "elev_gain_m", "op": ">=", "value": gain]
                ],
            ]
        }
    )

    // MARK: - Swimming

    private static let swimmingLapsTemplate = ChallengeTemplate(
        id: "swimming_laps",
        name: "Swimming — Distance Target",
        hint: "Accumulate swimming distance within the challenge window",
        fitnessKind: "swimming",
        kindId: .swimming,
        modelId: "fitness.swimming@1",
        modelHash: ServerConfig.fitnessSwimmingHash,
        fields: [
            TemplateField(key: "distanceKm", label: "Target Distance (km)", kind: .number(min: 0.1, max: nil, step: 0.1, defaultValue: 1)),
        ],
        paramsBuilder: { args in
            let km = args["distanceKm"] as? Double ?? 1.0
            return [
                "minMeters": Int(km * 1000),
                "types": "swim",
            ]
        },
        ruleBuilder: { args, start, end in
            let km = args["distanceKm"] as? Double ?? 1.0
            return [
                "challengeType": "swim",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "distance_km", "op": ">=", "value": km]
                ],
            ]
        }
    )

    // MARK: - Walking

    private static let walkingDistanceTemplate = ChallengeTemplate(
        id: "walking_distance",
        name: "Walking — Distance Target",
        hint: "Accumulate walking distance within the challenge window",
        fitnessKind: "walking",
        kindId: .fitnessGeneral,
        modelId: "fitness.walking@1",
        modelHash: ServerConfig.fitnessWalkingHash,
        fields: [
            TemplateField(key: "distanceKm", label: "Target Distance (km)", kind: .number(min: 0.5, max: nil, step: 0.5, defaultValue: 5)),
        ],
        paramsBuilder: { args in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "minMeters": Int(km * 1000),
                "types": "walk",
            ]
        },
        ruleBuilder: { args, start, end in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "challengeType": "walk",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "walking_km", "op": ">=", "value": km]
                ],
            ]
        }
    )

    // MARK: - Strength

    private static let strengthWorkoutTemplate = ChallengeTemplate(
        id: "strength_workouts",
        name: "Strength — Workout Sessions",
        hint: "Complete X strength training sessions in the challenge window",
        fitnessKind: "strength",
        kindId: .fitnessGeneral,
        modelId: "fitness.strength@1",
        modelHash: ServerConfig.fitnessStrengthHash,
        fields: [
            TemplateField(key: "sessions", label: "Sessions", kind: .number(min: 1, max: nil, step: 1, defaultValue: 5)),
        ],
        paramsBuilder: { args in
            [
                "minSessions": args["sessions"] ?? 5,
                "types": "strength",
            ]
        },
        ruleBuilder: { args, start, end in
            let sessions = args["sessions"] as? Double ?? 5.0
            return [
                "challengeType": "strength",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "strength_sessions", "op": ">=", "value": sessions]
                ],
            ]
        }
    )

    // MARK: - Yoga

    private static let yogaDurationTemplate = ChallengeTemplate(
        id: "yoga_duration",
        name: "Yoga — Duration Target",
        hint: "Accumulate yoga practice time within the challenge window",
        fitnessKind: "yoga",
        kindId: .fitnessGeneral,
        modelId: "fitness.yoga@1",
        modelHash: ServerConfig.fitnessYogaHash,
        fields: [
            TemplateField(key: "durationMin", label: "Target Minutes", kind: .number(min: 10, max: nil, step: 10, defaultValue: 60)),
        ],
        paramsBuilder: { args in
            [
                "minDurationMin": args["durationMin"] ?? 60,
                "types": "yoga",
            ]
        },
        ruleBuilder: { args, start, end in
            let minutes = args["durationMin"] as? Double ?? 60.0
            return [
                "challengeType": "yoga",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "yoga_min", "op": ">=", "value": minutes]
                ],
            ]
        }
    )

    // MARK: - HIIT

    private static let hiitSessionsTemplate = ChallengeTemplate(
        id: "hiit_sessions",
        name: "HIIT — Session Time",
        hint: "Accumulate HIIT / CrossFit training time",
        fitnessKind: "hiit",
        kindId: .fitnessGeneral,
        modelId: "fitness.hiit@1",
        modelHash: ServerConfig.fitnessHiitHash,
        fields: [
            TemplateField(key: "durationMin", label: "Target Minutes", kind: .number(min: 10, max: nil, step: 10, defaultValue: 60)),
        ],
        paramsBuilder: { args in
            [
                "minDurationMin": args["durationMin"] ?? 60,
                "types": "hiit,crossfit",
            ]
        },
        ruleBuilder: { args, start, end in
            let minutes = args["durationMin"] as? Double ?? 60.0
            return [
                "challengeType": "hiit",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "hiit_min", "op": ">=", "value": minutes]
                ],
            ]
        }
    )

    // MARK: - Rowing

    private static let rowingDistanceTemplate = ChallengeTemplate(
        id: "rowing_distance",
        name: "Rowing — Distance Target",
        hint: "Accumulate rowing distance within the challenge window",
        fitnessKind: "rowing",
        kindId: .fitnessGeneral,
        modelId: "fitness.rowing@1",
        modelHash: ServerConfig.fitnessRowingHash,
        fields: [
            TemplateField(key: "distanceKm", label: "Target Distance (km)", kind: .number(min: 0.5, max: nil, step: 0.5, defaultValue: 5)),
        ],
        paramsBuilder: { args in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "minMeters": Int(km * 1000),
                "types": "rowing",
            ]
        },
        ruleBuilder: { args, start, end in
            let km = args["distanceKm"] as? Double ?? 5.0
            return [
                "challengeType": "rowing",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "rowing_km", "op": ">=", "value": km]
                ],
            ]
        }
    )

    // MARK: - Calories

    private static let calorieBurnTemplate = ChallengeTemplate(
        id: "calorie_burn",
        name: "Calorie Burn Target",
        hint: "Burn a target amount of active calories",
        fitnessKind: "calories",
        kindId: .fitnessGeneral,
        modelId: "fitness.calories@1",
        modelHash: ServerConfig.fitnessCaloriesHash,
        fields: [
            TemplateField(key: "calories", label: "Target Calories (kcal)", kind: .number(min: 100, max: nil, step: 100, defaultValue: 500)),
        ],
        paramsBuilder: { args in
            [
                "minCalories": args["calories"] ?? 500,
                "types": "any",
            ]
        },
        ruleBuilder: { args, start, end in
            let cals = args["calories"] as? Double ?? 500.0
            return [
                "challengeType": "calories",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "calories", "op": ">=", "value": cals]
                ],
            ]
        }
    )

    // MARK: - Exercise Time

    private static let exerciseTimeTemplate = ChallengeTemplate(
        id: "exercise_time",
        name: "Exercise Minutes Target",
        hint: "Accumulate Apple Exercise ring minutes from any activity",
        fitnessKind: "exercise",
        kindId: .fitnessGeneral,
        modelId: "fitness.exercise@1",
        modelHash: ServerConfig.fitnessExerciseHash,
        fields: [
            TemplateField(key: "minutes", label: "Target Minutes", kind: .number(min: 10, max: nil, step: 10, defaultValue: 150)),
        ],
        paramsBuilder: { args in
            [
                "minMinutes": args["minutes"] ?? 150,
                "types": "any",
            ]
        },
        ruleBuilder: { args, start, end in
            let minutes = args["minutes"] as? Double ?? 150.0
            return [
                "challengeType": "exercise_time",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "exercise_time", "op": ">=", "value": minutes]
                ],
            ]
        }
    )

    // MARK: - Duration

    private static let durationThresholdTemplate = ChallengeTemplate(
        id: "duration_threshold",
        name: "Active Minutes Threshold",
        hint: "Accumulate active minutes from any fitness activity",
        fitnessKind: "running",
        kindId: .fitnessGeneral,
        modelId: "fitness.distance@1",
        modelHash: ServerConfig.fitnessDistanceHash,
        fields: [
            TemplateField(key: "durationMin", label: "Target Minutes", kind: .number(min: 10, max: nil, step: 10, defaultValue: 150)),
            TemplateField(key: "activityType", label: "Activity", kind: .select(
                options: [
                    (value: "run,walk", label: "Running & Walking"),
                    (value: "ride,cycle", label: "Cycling"),
                    (value: "swim", label: "Swimming"),
                    (value: "run,walk,ride,swim", label: "Any"),
                ],
                defaultValue: "run,walk"
            )),
        ],
        paramsBuilder: { args in
            [
                "minDurationMin": args["durationMin"] ?? 150,
                "types": args["activityType"] ?? "run,walk",
            ]
        },
        ruleBuilder: { args, start, end in
            let minutes = args["durationMin"] as? Double ?? 150.0
            return [
                "challengeType": "run",
                "period": [
                    "start": ISO8601DateFormatter().string(from: start),
                    "end": ISO8601DateFormatter().string(from: end),
                ],
                "conditions": [
                    ["metric": "duration_min", "op": ">=", "value": minutes]
                ],
            ]
        }
    )
}
