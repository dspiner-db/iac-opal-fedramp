import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { randomUUID } from "crypto";
import { SubnetCIDRAdviser, ICalculatorSubnet } from 'subnet-cidr-calculator'

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
    // Get the Cidr in a format for for creating subnets
    let [vpcAddress, netmask] = CIDR.split('/')

    const vpcSubnets: ICalculatorSubnet[] = SubnetCIDRAdviser.calculate(vpcAddress, netmask, [ CIDR ]).subnets.filter(s => s.value.includes(`/${netmask}`))

    const azs = await aws.getAvailabilityZones({
        state: "available"
    })

    let clusterVPC_name = ``
    const clusterVPC = new aws.ec2.Vpc(clusterVPC_name, {
        cidrBlock: CIDR,
        enableDnsHostnames: true
    })

    const publicSubnets: aws.ec2.Subnet[] = []
    const privateSubnets: aws.ec2.Subnet[] = []

    let subnetCounter = 0
    azs.names.forEach((az: string) => {

        let subnetBaseName = `${BASE_NAME}-cluster/Subnet`
        let privateName = `${subnetBaseName}Private${az.toUpperCase()}`

        let privateTags = createTags(privateName)
        privateTags[`kubernetes.io/cluster/${BASE_NAME}` as keyof typeof privateTags] = "shared"
        privateTags["kubernetes.io/role/internal-elb" as keyof typeof privateTags] = "1"

        privateSubnets.push(new aws.ec2.Subnet(privateName, {
            vpcId: clusterVPC.id,
            cidrBlock: vpcSubnets[subnetCounter].value,
            availabilityZone: az,
            tags: privateTags
        }))
        subnetCounter ++

        let publicName = `${subnetBaseName}Public${az.toUpperCase()}`
        let publicTags = createTags(publicName)
        publicTags[`kubernetes.io/cluster/${BASE_NAME}` as keyof typeof publicTags] = "shared"
        publicTags["kubernetes.io/role/elb" as keyof typeof publicTags] = "1"

        publicSubnets.push(new aws.ec2.Subnet(publicName, {
            vpcId: clusterVPC.id,
            cidrBlock: vpcSubnets[subnetCounter].value,
            availabilityZone: az,
            tags: publicTags
        }))
        subnetCounter ++

    })

    let natGatewayIP_name = ``
    const natGatewayIP = new aws.ec2.Eip(natGatewayIP_name,{
        vpc: true
    })

    let natGateway_name = ``
    const natGateway = new aws.ec2.NatGateway(natGateway_name, {
        subnetId: publicSubnets[0].id,
        allocationId: natGatewayIP.allocationId
    })

    let internetGateway_name = ``
    const internetGateway = new aws.ec2.InternetGateway(internetGateway_name, {
        vpcId: clusterVPC.id,
        tags: createTags(internetGateway_name)
    })

    // const privateRouteTables: aws.ec2.RouteTable[] = 
    privateSubnets.forEach((subnet) => {
        subnet.cidrBlock.apply((cidr) => {
            let rt_name = ``
            new aws.ec2.RouteTable(rt_name, {
                vpcId: clusterVPC.id,
                routes: [
                    {
                        cidrBlock: cidr,
                        natGatewayId: natGateway.id
                    }
                ],
                tags: createTags(rt_name)
            })
        })
    })

}


async function main(){

    const identity = await aws.getCallerIdentity()

    const clusterAdminRole = aws.iam.getRole({
        name: ``
    })


}

main()