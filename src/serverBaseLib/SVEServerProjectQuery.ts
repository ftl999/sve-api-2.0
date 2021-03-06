import {SVEProjectQuery, SVEAccount, SVEProject as SVEBaseProject, SVEGroup as SVEBaseGroup} from 'svebaselib';
import {SVEServerGroup as SVEGroup} from './SVEServerGroup';
import {SVEServerProject as SVEProject} from './SVEServerProject';
import * as levenshtein from 'fast-levenshtein';

export class SVEServerProjectQuery extends SVEProjectQuery {
    protected static distanceMap: Map<SVEBaseProject | SVEBaseGroup, number> = new Map<SVEProject | SVEBaseGroup, number>();

    public static getDistanceOf(item: SVEBaseProject | SVEBaseGroup): number {
        return SVEServerProjectQuery.distanceMap.get(item)!;
    }

    protected static executeQuery(queryForGroups: boolean, queryForProjects: boolean, str: string, resolve: (val:(SVEBaseProject | SVEBaseGroup)[]) => void, groupProjectMap: Map<SVEBaseGroup, SVEBaseProject[]>) {
        SVEServerProjectQuery.distanceMap = new Map<SVEProject | SVEBaseGroup, number>();
        let retList: (SVEBaseProject | SVEBaseGroup)[] = [];

        groupProjectMap.forEach((projects, group) => {
            let innerRetList: (SVEBaseProject | SVEBaseGroup)[] = [];
            let groupDist = 0;

            if (queryForProjects || (!queryForProjects && !queryForGroups))
            {
                projects.forEach(project => {
                    let dist = levenshtein.get(project.getName(), str);

                    // first evaluate all projects and also send them to the client. Ranking and dismissing of projects will be done with respect to all other projects of the same context.
                    if (dist / str.length < 1.0) {
                        innerRetList.push(project);
                        SVEServerProjectQuery.distanceMap.set(project, dist);
                        groupDist += dist;
                    }
                });

                // weight the relevance of a context based on it's contained and matching projects. I think the most users will search for existing projects than for contexts.
                let dist = (levenshtein.get(group.getName(), str) + groupDist * 1.0/(innerRetList.length + 1)) / (innerRetList.length + 1);
                if ((queryForProjects && innerRetList.length > 0) || dist / str.length < 0.75) {
                    innerRetList.push(group);
                    SVEServerProjectQuery.distanceMap.set(group, dist);
                }

                retList = retList.concat(innerRetList);
            } else {
                let dist = levenshtein.get(group.getName(), str);

                // first evaluate all projects and also send them to the client. Ranking and dismissing of projects will be done with respect to all other projects of the same context.
                if (dist / str.length < 1.0) {
                    retList.push(group);
                    SVEServerProjectQuery.distanceMap.set(group, dist);
                }
            }
        });
        resolve(retList);
    }

    public static query(str: string, requester: SVEAccount): Promise<(SVEBaseProject | SVEBaseGroup)[]> {
        return new Promise<(SVEBaseProject | SVEBaseGroup)[]>((resolve, reject) => {
            str = str.trim().toLowerCase();
            let queryForGroups = str.includes("gruppe:");
            let queryForProjects = false;

            if(queryForGroups) {
                str = str.split("gruppe:")[1];
            } else {
                queryForProjects = str.includes("projekt:");
                if(queryForProjects) {
                    str = str.split("projekt:")[1];
                }
            }         

            SVEGroup.getGroupsOf(requester).then(groups => {
                let groupProjectMap: Map<SVEBaseGroup, SVEBaseProject[]> = new Map<SVEBaseGroup, SVEBaseProject[]>();
                groups.forEach(group => {
                    if (queryForGroups) {
                        group.getProjects().then(projects => {
                            groupProjectMap.set(group, projects);
                            if(groupProjectMap.size === groups.length) {
                                SVEServerProjectQuery.executeQuery(queryForGroups, queryForProjects, str, resolve, groupProjectMap);
                            }
                        });
                    } else {
                        groupProjectMap.set(group, []);
                        if(groupProjectMap.size === groups.length) {
                            SVEServerProjectQuery.executeQuery(queryForGroups, queryForProjects, str, resolve, groupProjectMap);
                        }
                    }
                });
            });
        });
    }
}