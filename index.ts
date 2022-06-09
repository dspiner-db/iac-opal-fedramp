import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { randomUUID } from "crypto";
import { SubnetCIDRAdviser, ICalculatorResults } from 'subnet-cidr-calculator'

const CONFIG = new pulumi.Config()
const PROJECT_ID = CONFIG.get('projectId') || process.env.PROJECT_ID || randomUUID()
const STACK_NAME = pulumi.getStack()
const PROJECT_NAME = CONFIG.get('projectName') || pulumi.getProject()
const BASE_NAME = `${STACK_NAME}-${PROJECT_NAME}`
const CIDR = CONFIG.require('cidr')
const OWNER = CONFIG.require('owner')
const AWS_REGION = 'us-west-2'

function createTags(Name: string){
    return {
        Project: PROJECT_NAME,
        Owner: OWNER,
        ClusterName: `${BASE_NAME}-cluster`,
        Environment: STACK_NAME,
        ProjectId: PROJECT_ID,
        Name
    }
}


async function networking(){

    const azs = await aws.getAvailabilityZones({
        state: "available"
    })

    let clusterVPC_name = ``
    const clusterVPC = new aws.ec2.Vpc(clusterVPC_name, {
        cidrBlock: CIDR,
        enableDnsHostnames: true
    })

    const subnets = [
        {
            type: "public",
            az: `${AWS_REGION}a`,
            cidr: ""
        },
        {

        }
    ].map((subnet) => {
        let subnetName = ``
        let baseTags = createTags(subnetName)
        baseTags[`kubernetes.io/cluster/${BASE_NAME}` as keyof typeof baseTags] = "shared"

        if(subnet.type == "public"){
            baseTags["kubernetes.io/role/elb" as keyof typeof baseTags] = "1"
        }
        else{
            baseTags["kubernetes.io/role/internal-elb" as keyof typeof baseTags] = "1"
        }

        return new aws.ec2.Subnet(subnetName, {
            vpcId: clusterVPC.id,
            cidrBlock: subnet.cidr,
            availabilityZone: subnet.az,
            tags: baseTags
        })
    })

    let natGatewayIP_name = ``
    const natGatewayIP = new aws.ec2.Eip(natGatewayIP_name,{
        vpc: true
    })

    let natGateway_name = ``
    const natGateway = new aws.ec2.NatGateway(natGateway_name, {
        subnetId: subnets[0].id,
        allocationId: natGatewayIP.allocationId
    })

    subnets.filter(subnet => subnet.)

}


async function main(){

    const identity = await aws.getCallerIdentity()

    const clusterAdminRole = aws.iam.getRole({
        name: ``
    })


}

main()